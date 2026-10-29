// A refração com trabalho fixo por pixel (spec 039 refeita, D1): cada pixel da fila tem `REFRACTION_CHAIN_SLOTS` vagas
// fixas — 0 a reflexão da primeira interface, 1 a transmissão (o canal 0 depois que a dispersão começa), 2 e 3 os
// canais 1 e 2 que a dispersão abre — e cada rodada traça um acerto por vaga viva (`refraction_chain_hit_main`, sem
// material), avalia o material por classe na onda (duas entradas por vaga: o acerto e a dielétrica coincidente) e segue
// (`refraction_chain_follow_main`): na primeira interface, os dois lobos (a reflexão na vaga 0); depois, um lobo pela
// roleta de Fresnel; a borda que não muda o meio segue reto. O caminho que termina guarda a luz na própria vaga; o
// fechamento por pixel (`refraction_chain_resolve_main`) soma as vagas na ordem delas. Os pixels vão em blocos de
// `REFRACTION_CHAIN_PIXELS`; o número de rodadas e de despachos é fixo. Nenhuma fila, nenhum laço sem teto.
// Limite medido: a vaga da reflexão não abre canais (num meio que dispersa ela segue pelo índice do verde).
// Cada rodada percorre só as vagas vivas: duas listas em pingue-pongue (a corrente e a da rodada seguinte), do tamanho
// das vagas do bloco (nunca estouram); a onda é indexada pela posição na lista corrente.
// Cabeçalho (`refraction_path_queue`): [0] os pixels da fila no quadro; [1] o primeiro pixel do bloco corrente; [2] a
// lista corrente; [3] e [4] as contagens das duas listas; as listas a partir de `REFRACTION_CHAIN_HEADER`.
// Requer: WORKGROUP_SIZE, NONE, REFRACTION_FRAME_COUNT, refraction, refraction_path, refraction_queue_in,
// refraction_frame, refraction_request, REFRACTION_REQUEST_VALID, ray_wave, RefractionChainState, refraction_paths, refraction_path_queue, refraction_radiance_out,
// refraction_hit_out, refraction_albedo_out.

/** Vagas por pixel. */
const REFRACTION_CHAIN_SLOTS: u32 = 4u;
/** As vagas: a reflexão da primeira interface, a transmissão (canal 0 na dispersão), os canais 1 e 2. */
const REFRACTION_SLOT_REFLECT: u32 = 0u;
const REFRACTION_SLOT_MAIN: u32 = 1u;
/** Marcas do estado: o caminho tocou algo em movimento; o caminho ainda está na primeira interface (a da câmera). */
const REFRACTION_CHAIN_MOVED: u32 = 1u;
const REFRACTION_CHAIN_CAMERA: u32 = 2u;

/** Pixels por bloco (as vagas e a onda de um bloco). */
override REFRACTION_CHAIN_PIXELS: u32 = 65536u;

/** Palavras do cabeçalho; as duas listas das vagas vivas vêm depois. */
const REFRACTION_CHAIN_HEADER: u32 = 8u;

/** Vagas de um bloco (o tamanho de cada lista). */
fn refraction_chain_capacity() -> u32 {
    return REFRACTION_CHAIN_SLOTS * REFRACTION_CHAIN_PIXELS;
}

/** Põe a vaga `s` na lista `list`. */
fn refraction_chain_push(list: u32, s: u32) {
    let k = atomicAdd(&refraction_path_queue[3u + list], 1u);
    atomicStore(&refraction_path_queue[REFRACTION_CHAIN_HEADER + list * refraction_chain_capacity() + k], s);
}

/** A vaga `s` segue viva na rodada seguinte. */
fn refraction_chain_keep(s: u32) {
    refraction_chain_push(1u - atomicLoad(&refraction_path_queue[2]), s);
}

/** A lista corrente e o tamanho dela. */
fn refraction_chain_current() -> u32 {
    return atomicLoad(&refraction_path_queue[2]);
}

fn refraction_chain_live() -> u32 {
    return min(atomicLoad(&refraction_path_queue[3u + refraction_chain_current()]), refraction_chain_capacity());
}

/** A vaga da posição `j` da lista corrente. */
fn refraction_chain_at(j: u32) -> u32 {
    return atomicLoad(&refraction_path_queue[REFRACTION_CHAIN_HEADER
        + refraction_chain_current() * refraction_chain_capacity() + j]);
}

/** Pixels do bloco corrente que existem na fila. */
fn refraction_chain_block() -> u32 {
    let base = refraction_chain_base();
    let count = refraction_chain_pixels();
    return select(0u, min(count - base, REFRACTION_CHAIN_PIXELS), count > base);
}

/** Os pixels da fila no quadro. */
fn refraction_chain_pixels() -> u32 {
    return atomicLoad(&refraction_path_queue[0]);
}

/** O primeiro pixel da fila no bloco corrente. */
fn refraction_chain_base() -> u32 {
    return atomicLoad(&refraction_path_queue[1]);
}

/** O acerto guardado no estado da vaga. */
fn refraction_chain_hit_of(p: RefractionChainState) -> RayHit {
    return RayHit(p.hit_t, p.hit_instance, p.hit_primitive, p.hit_renderable, vec2f(0.0), p.hit_face,
        p.hit_position, p.hit_normal, vec2f(0.0));
}

/** A dielétrica coincidente guardada no estado da vaga (`NONE` sem ela). */
fn refraction_chain_other_of(p: RefractionChainState) -> RayHit {
    var h = ray_miss();
    h.instance = p.other_instance;
    h.face = p.other_face;
    return h;
}

/** O caminho da vaga `p` termina com a luz `radiance` (já com o peso), o fim e o albedo. */
fn refraction_chain_end(p0: RefractionChainState, radiance: vec3f, end: vec4f, albedo: vec3f, moved: bool)
    -> RefractionChainState {
    var p = p0;
    p.alive = 0u;
    p.radiance += radiance;
    p.moving += select(vec3f(0.0), radiance, moved || (p.flags & REFRACTION_CHAIN_MOVED) != 0u);
    p.end = end;
    p.albedo = albedo;
    return p;
}

/** A vaga `p` segue do nó `n` na direção `dir`, com a pilha `stack` e o peso multiplicado por `w`. */
fn refraction_chain_continue(p0: RefractionChainState, n: RefractionNode, dir: vec3f, stack: RefractionStack,
    w: vec3f) -> RefractionChainState {
    var p = p0;
    p.weight *= w;
    p.dir = dir;
    p.stack = stack;
    p.origin = refraction_departure(n.p, n.nf, dir);
    p.side = refraction_side_after(n, dir);
    p.flags &= ~REFRACTION_CHAIN_CAMERA;
    return p;
}

// ---- Os blocos ----

/** O começo do quadro: os pixels da fila e o bloco antes do primeiro. */
@compute @workgroup_size(1)
fn refraction_chain_reset_main() {
    atomicStore(&refraction_path_queue[0], textureLoad(refraction_frame, vec2u(REFRACTION_FRAME_COUNT, 0u), 0).x);
    atomicStore(&refraction_path_queue[1], 0u - REFRACTION_CHAIN_PIXELS);
}

/** O bloco seguinte, com as listas vazias. */
@compute @workgroup_size(1)
fn refraction_chain_chunk_main() {
    atomicStore(&refraction_path_queue[1], atomicLoad(&refraction_path_queue[1]) + REFRACTION_CHAIN_PIXELS);
    atomicStore(&refraction_path_queue[2], 0u);
    atomicStore(&refraction_path_queue[3], 0u);
    atomicStore(&refraction_path_queue[4], 0u);
}

/** O fim de uma rodada: a lista seguinte vira a corrente, e a outra fica vazia. */
@compute @workgroup_size(1)
fn refraction_chain_swap_main() {
    let next = 1u - atomicLoad(&refraction_path_queue[2]);
    atomicStore(&refraction_path_queue[2], next);
    atomicStore(&refraction_path_queue[3u + (1u - next)], 0u);
}

/**
 * As vagas dos pixels do bloco: a da transmissão viva no raio da câmera do pixel (do plano próximo, com a pilha da
 * câmera e a absorção desde o plano próximo), as outras vazias. Os grupos percorrem os pixels em passo de grade.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_chain_roots_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let base = refraction_chain_base();
    let size = textureDimensions(refraction_queue_in);
    let block = refraction_chain_block();
    for (var i = gid.x; i < block; i += nwg.x * WORKGROUP_SIZE) {
        let q = base + i;
        var p: RefractionChainState;
        p.alive = 0u;
        p.weight = vec3f(0.0);
        p.radiance = vec3f(0.0);
        p.truncated = vec3f(0.0);
        p.moving = vec3f(0.0);
        p.albedo = vec3f(1.0);
        p.end = refraction_end(vec3f(0.0), NONE);
        p.channel = -1;
        p.interfaces = 0u;
        p.flags = 0u;
        p.steps = 0u;
        p.pixel = NONE;
        // As outras vagas do pixel só marcadas vazias (o estado inteiro tem centenas de bytes).
        for (var k = 0u; k < REFRACTION_CHAIN_SLOTS; k++) {
            if (k != REFRACTION_SLOT_MAIN) { refraction_paths[REFRACTION_CHAIN_SLOTS * i + k].pixel = NONE; }
        }
        let pixel = textureLoad(refraction_queue_in, vec2u(q % size.x, q / size.x), 0).x;
        let px = vec2u(pixel % size.x, pixel / size.x);
        let ray = camera_ray(refraction.camera_slot, vec2f(px) + 0.5, vec2f(size));
        // O raio começa pouco antes da interface pedida no pixel (a distância dela no pedido; a margem cobre a diferença
        // entre a malha desenhada e a superfície que a marcha acha): o espaço vazio até ela não é atravessado.
        let request = textureLoad(refraction_request, px, 0);
        var start = ray.near;
        if ((request.y & REFRACTION_REQUEST_VALID) != 0u) {
            let d = bitcast<f32>(request.x);
            start = max(ray.near, d - max(0.01, 0.02 * d));
        }
        p.pixel = pixel;
        p.alive = 1u;
        p.origin = ray.origin + ray.dir * start;
        p.dir = ray.dir;
        p.side = -1;
        p.state = refraction_seed(pixel, refraction.frame);
        p.flags = REFRACTION_CHAIN_CAMERA;
        p.stack = refraction_camera_stack();
        // A absorção desde o plano próximo da câmera (dentro de um meio, ela conta desde ali) até o começo do raio.
        p.weight = refraction_absorb(vec3f(1.0), refraction_current(p.stack), start);
        refraction_paths[REFRACTION_CHAIN_SLOTS * i + REFRACTION_SLOT_MAIN] = p;
        refraction_chain_push(0u, REFRACTION_CHAIN_SLOTS * i + REFRACTION_SLOT_MAIN);
    }
}

// ---- Uma rodada ----

/** O acerto seguinte da vaga da posição `j` da lista e a dielétrica coincidente, na onda (entradas 2j e 2j + 1). */
fn refraction_chain_hit_one(j: u32) {
    let s = refraction_chain_at(j);
    let origin = refraction_paths[s].origin;
    let dir = refraction_paths[s].dir;
    let hit = refraction_scene_hit(origin, dir, REFRACTION_FAR, refraction_paths[s].side);
    refraction_paths[s].hit_t = hit.t;
    refraction_paths[s].hit_instance = hit.instance;
    refraction_paths[s].hit_face = hit.face;
    refraction_paths[s].hit_renderable = hit.renderable;
    refraction_paths[s].hit_primitive = hit.primitive;
    refraction_paths[s].hit_position = hit.position;
    refraction_paths[s].hit_normal = hit.normal;
    refraction_paths[s].other_instance = NONE;
    if (hit.instance == NONE) {
        ray_wave_put_empty(2u * j, vec4f(0.0));
        ray_wave_put_empty(2u * j + 1u, vec4f(0.0));
        return;
    }
    refraction_wave_put(2u * j, hit, refraction.time, vec4f(1.0));
    let other = refraction_coincident(origin, dir, hit);
    refraction_paths[s].other_instance = other.instance;
    refraction_paths[s].other_face = other.face;
    if (other.instance == NONE) {
        ray_wave_put_empty(2u * j + 1u, vec4f(0.0));
    } else {
        refraction_wave_put(2u * j + 1u, other, refraction.time, vec4f(1.0));
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_chain_hit_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = refraction_chain_live();
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) { refraction_chain_hit_one(j); }
}

/**
 * A dispersão começa no nó `n` (os índices por canal dos dois lados, a microfaceta): a transmissão de cada canal na vaga
 * dele (o canal 0 na vaga `s` da transmissão, os outros nas vagas 2 e 3 do pixel), com o peso `w` vezes a transmitância
 * do canal dividido por `share` (a probabilidade da escolha da transmissão).
 */
fn refraction_chain_disperse(p: RefractionChainState, s: u32, n: RefractionNode, f: vec3f, share: f32) {
    let first = s - (s % REFRACTION_CHAIN_SLOTS);
    let after = refraction_after_node(p.stack, n);
    for (var k = 0; k < 3; k++) {
        let t = refraction_transmit(p.dir, n.m, n.ns, n.nf, n.ior_before[k], n.ior_next[k], n.alpha);
        var w = vec3f(0.0);
        w[k] = (1.0 - f[k]) * t.weight / share;
        var c = refraction_chain_continue(p, n, t.dir, after, w);
        c.channel = k;
        c.radiance = vec3f(0.0);
        c.moving = vec3f(0.0);
        c.truncated = vec3f(0.0);
        c.state = pcg_hash(p.state ^ (0x9e3779b9u * u32(k + 1)));
        c.alive = select(0u, 1u, t.weight > 0.0);
        // O canal sem transmissão não ocupa a vaga dele (a vaga vazia não disputa o fim do pixel).
        if (k != 0 && c.alive == 0u) { continue; }
        let at = select(first + 1u + u32(k), s, k == 0);
        if (k == 0) {
            // A vaga da transmissão guarda a luz que o caminho já somou.
            c.radiance = p.radiance;
            c.moving = p.moving;
            c.truncated = p.truncated;
        }
        refraction_paths[at] = c;
        if (c.alive != 0u) { refraction_chain_keep(at); }
    }
}

/** A continuação da vaga da posição `j` da lista: o nó do acerto pelos fechamentos da onda e o passo. */
fn refraction_chain_follow_one(j: u32) {
    let s = refraction_chain_at(j);
    var p = refraction_paths[s];
    var state = p.state;
    var c2 = closure_zero();
    if (p.other_instance != NONE) { c2 = ray_wave_entries[2u * j + 1u].closure; }
    let n = refraction_node_at(p.origin, p.dir, refraction_chain_hit_of(p), ray_wave_entries[2u * j].closure,
        refraction_chain_other_of(p), c2, p.stack, p.channel, p.interfaces, &state);
    p.weight *= n.through;
    p.state = state;
    if (n.moved) { p.flags |= REFRACTION_CHAIN_MOVED; }
    if (n.done) {
        p.truncated += p.weight * n.truncated;
        refraction_paths[s] = refraction_chain_end(p, p.weight * n.radiance, n.end, n.albedo, false);
        return;
    }
    p.interfaces = n.interfaces;
    p.steps += 1u;
    if (n.passes) {
        let camera = p.flags & REFRACTION_CHAIN_CAMERA;
        p = refraction_chain_continue(p, n, p.dir, refraction_after_node(p.stack, n), vec3f(1.0));
        p.flags |= camera;
        refraction_paths[s] = p;
        refraction_chain_keep(s);
        return;
    }
    let after = refraction_after_node(p.stack, n);
    let camera = (p.flags & REFRACTION_CHAIN_CAMERA) != 0u;
    // Os lobos: a reflexão e a transmissão (com dispersão, por canal).
    var f = vec3f(n.p_reflect);
    var reflect_dir = n.reflect_dir;
    var reflect_weight = n.reflect_weight;
    if (n.disperse) {
        let cos_m = dot(-p.dir, n.m);
        f = vec3f(
            refraction_fresnel(cos_m, n.ior_before.x, n.ior_next.x),
            refraction_fresnel(cos_m, n.ior_before.y, n.ior_next.y),
            refraction_fresnel(cos_m, n.ior_before.z, n.ior_next.z),
        );
        let r = refraction_reflect(p.dir, n.m, n.ns, n.nf, n.alpha);
        reflect_dir = r.dir;
        reflect_weight = f * r.weight;
    }
    let reflection_slot = s - (s % REFRACTION_CHAIN_SLOTS) + REFRACTION_SLOT_REFLECT;
    if (camera && s % REFRACTION_CHAIN_SLOTS == REFRACTION_SLOT_MAIN) {
        // A primeira interface: os dois lobos — a reflexão na vaga dela, a transmissão segue nesta.
        var r = refraction_chain_continue(p, n, reflect_dir, p.stack, reflect_weight);
        r.radiance = vec3f(0.0);
        r.moving = vec3f(0.0);
        r.truncated = vec3f(0.0);
        r.state = pcg_hash(p.state ^ 0x68bc21ebu);
        r.alive = 1u;
        if (any(reflect_weight > vec3f(0.0))) {
            refraction_paths[reflection_slot] = r;
            refraction_chain_keep(reflection_slot);
        }
        if (n.disperse) {
            refraction_chain_disperse(p, s, n, f, 1.0);
            return;
        }
        if (all(n.transmit_weight <= vec3f(0.0))) {
            refraction_paths[s] = refraction_chain_end(p, vec3f(0.0), n.end, vec3f(1.0), false);
            return;
        }
        refraction_paths[s] = refraction_chain_continue(p, n, n.transmit_dir, after, n.transmit_weight);
        refraction_chain_keep(s);
        return;
    }
    // Depois da primeira interface: um lobo pela roleta de Fresnel (sem viés).
    let p_reflect = clamp(select(n.p_reflect, (f.x + f.y + f.z) / 3.0, n.disperse), 1e-4, 1.0 - 1e-4);
    let u = refraction_random(&state);
    p.state = state;
    let reflects = u < p_reflect;
    if (n.disperse && !reflects && s % REFRACTION_CHAIN_SLOTS == REFRACTION_SLOT_MAIN) {
        refraction_chain_disperse(p, s, n, f, 1.0 - p_reflect);
        return;
    }
    var dir = select(n.transmit_dir, reflect_dir, reflects);
    var weight = select(n.transmit_weight, reflect_weight, reflects) / select(1.0 - p_reflect, p_reflect, reflects);
    if (n.disperse && !reflects) {
        // A vaga da reflexão num meio que dispersa: o índice do verde (limite medido, sem abrir canais).
        let t = refraction_transmit(p.dir, n.m, n.ns, n.nf, n.ior_before.y, n.ior_next.y, n.alpha);
        dir = t.dir;
        weight = vec3f((1.0 - f.y) * t.weight) / (1.0 - p_reflect);
    }
    if (all(weight <= vec3f(0.0))) {
        refraction_paths[s] = refraction_chain_end(p, vec3f(0.0), n.end, vec3f(1.0), false);
        return;
    }
    refraction_paths[s] = refraction_chain_continue(p, n, dir, refraction_stack_pick(p.stack, after, !reflects),
        weight);
    refraction_chain_keep(s);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_chain_follow_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let n = refraction_chain_live();
    for (var j = gid.x; j < n; j += nwg.x * WORKGROUP_SIZE) { refraction_chain_follow_one(j); }
}

/** A pilha `b` quando `pick_b`, senão `a` (o `select` do WGSL não escolhe structs). */
fn refraction_stack_pick(a: RefractionStack, b: RefractionStack, pick_b: bool) -> RefractionStack {
    if (pick_b) { return b; }
    return a;
}

// ---- O fechamento ----

/**
 * Depois da última rodada de um bloco: por pixel, a vaga que ainda segue conta a energia como truncada; as vagas somadas
 * na ordem delas — a luz, a energia truncada, a parte em movimento —, o fim pela vaga de maior luminância (a primeira no
 * empate), o albedo pela média pesada pela luz (sem luz: o da vaga do fim).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_chain_resolve_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let base = refraction_chain_base();
    let count = refraction_chain_pixels();
    let size = textureDimensions(refraction_queue_in);
    let block = refraction_chain_block();
    for (var i = gid.x; i < block; i += nwg.x * WORKGROUP_SIZE) {
        var radiance = vec3f(0.0);
        var truncated = 0.0;
        var moving = vec3f(0.0);
        var albedo = vec3f(0.0);
        var light = 0.0;
        var best = -1.0;
        var end = refraction_end(vec3f(0.0), NONE);
        var albedo_best = vec3f(1.0);
        var pixel = NONE;
        for (var k = 0u; k < REFRACTION_CHAIN_SLOTS; k++) {
            let p = refraction_paths[REFRACTION_CHAIN_SLOTS * i + k];
            if (p.pixel == NONE) { continue; }
            pixel = p.pixel;
            var tr = p.truncated;
            if (p.alive != 0u) { tr += p.weight; }
            radiance += p.radiance;
            truncated += luminance(tr);
            moving += p.moving;
            if (p.alive != 0u) { continue; }
            let l = luminance(p.radiance);
            albedo += l * p.albedo;
            light += l;
            if (l > best) {
                best = l;
                end = p.end;
                albedo_best = p.albedo;
            }
        }
        if (pixel == NONE) { continue; }
        let px = vec2u(pixel % size.x, pixel / size.x);
        let a = select(albedo_best, albedo / light, light > 0.0);
        textureStore(refraction_radiance_out, px, vec4f(radiance, truncated));
        textureStore(refraction_hit_out, px, end);
        let moved = clamp(luminance(moving) / max(luminance(radiance), 1e-6), 0.0, 1.0);
        textureStore(refraction_albedo_out, px, vec4f(a, moved));
    }
}
