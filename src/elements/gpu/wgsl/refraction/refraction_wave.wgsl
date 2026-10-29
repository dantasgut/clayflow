// A refração traçada em ondas (spec 039, R17): o caminho de cada pixel da fila (`refraction_sample` em
// `refraction_path`) vira caminhos-folha em paralelo, um estado por caminho (`RefractionPathState`), e cada rodada traça
// o acerto seguinte de cada caminho vivo (`refraction_wave_hit_main`: o acerto e a dielétrica coincidente na onda dos
// acertos, sem material), avalia o material por classe fora do traçado e segue (`refraction_wave_follow_main`): o nó do
// acerto pelo fechamento avaliado (`refraction_node_at`) e o passo do estágio — o acerto da câmera abre os ramos da
// primeira interface; o caminho até a segunda interface (`path_split`) abre os ramos dela; o caminho de um lobo
// (`refraction_path`) segue um lobo por interface, com o lobo raro olhado antes (o caminho traça o raro numa rodada e
// decide na seguinte, como o original); na interface em que a dispersão começa, um caminho por canal. O caminho que
// termina grava uma folha (a chave pixel × 64 + folha); o fechamento por pixel (`refraction_wave_resolve_main`) soma as
// folhas de cada pixel na ordem das chaves, depois de ordenadas. Fila dos vivos em pingue-pongue (`refraction_path_queue`:
// [0] a lista corrente, [1] e [2] as contagens, [3] o início do bloco, [4] os caminhos alocados, [5] as folhas, [6] os
// caminhos do bloco; as listas a partir de `REFRACTION_QUEUE_LISTS`). Sem laço que atravesse material; os laços restantes têm teto.
// Requer: WORKGROUP_SIZE, NONE, REFRACTION_FRAME_COUNT, refraction, refraction_path, refraction_queue_in,
// refraction_frame, ray_wave, RefractionPathState, RefractionLeaf, refraction_paths, refraction_path_queue,
// refraction_leaves, refraction_leaf_keys, refraction_leaf_values, refraction_leaf_count, refraction_radiance_out,
// refraction_hit_out, refraction_albedo_out.

const REFRACTION_QUEUE_LISTS: u32 = 8u;

/** Estágios de um caminho. */
const REFRACTION_STAGE_SAMPLE: u32 = 0u;
const REFRACTION_STAGE_SPLIT: u32 = 1u;
const REFRACTION_STAGE_PATH: u32 = 2u;
const REFRACTION_STAGE_LOOK: u32 = 3u;

/** Marcas do estado: o caminho tocou algo em movimento; o raro olhado era a reflexão. */
const REFRACTION_FLAG_MOVED: u32 = 1u;

/** A pilha `b` quando `pick_b`, senão `a` (o `select` do WGSL não escolhe structs). */
fn refraction_stack_pick(a: RefractionStack, b: RefractionStack, pick_b: bool) -> RefractionStack {
    if (pick_b) { return b; }
    return a;
}

/** Caminhos que a fila comporta. */
fn refraction_wave_slots() -> u32 {
    return arrayLength(&refraction_paths);
}

fn refraction_wave_push(list: u32, slot: u32) {
    let k = atomicAdd(&refraction_path_queue[1u + list], 1u);
    if (k >= refraction_wave_slots()) { return; }
    atomicStore(&refraction_path_queue[REFRACTION_QUEUE_LISTS + list * refraction_wave_slots() + k], slot);
}

fn refraction_wave_at(list: u32, k: u32) -> u32 {
    return atomicLoad(&refraction_path_queue[REFRACTION_QUEUE_LISTS + list * refraction_wave_slots() + k]);
}

/** Um caminho novo (alocado no fim da fila de caminhos), ou `NONE` sem vaga. */
fn refraction_wave_alloc() -> u32 {
    let slot = atomicAdd(&refraction_path_queue[4], 1u);
    if (slot >= refraction_wave_slots()) { return NONE; }
    return slot;
}

/** O caminho da posição `j` do bloco corrente (`NONE` além do bloco). */
fn refraction_wave_chunk_path(j: u32) -> u32 {
    if (j >= atomicLoad(&refraction_path_queue[6])) { return NONE; }
    let current = atomicLoad(&refraction_path_queue[0]);
    return refraction_wave_at(current, atomicLoad(&refraction_path_queue[3]) + j);
}

/** O acerto guardado no estado do caminho. */
fn refraction_wave_hit_of(p: RefractionPathState) -> RayHit {
    return RayHit(p.hit_t, p.hit_instance, p.hit_primitive, p.hit_renderable, vec2f(0.0), p.hit_face,
        p.hit_position, p.hit_normal, vec2f(0.0));
}

/** A dielétrica coincidente guardada no estado do caminho (`NONE` sem ela). */
fn refraction_wave_other_of(p: RefractionPathState) -> RayHit {
    var h = ray_miss();
    h.instance = p.other_instance;
    h.face = p.other_face;
    return h;
}

/** Grava a folha do caminho `p` que terminou com a luz `path` (`pending`: parou na interface da dispersão). */
fn refraction_wave_leaf(p: RefractionPathState, path: RefractionPath, pending: bool) {
    let k = atomicAdd(&refraction_path_queue[5], 1u);
    if (k >= arrayLength(&refraction_leaves)) { return; }
    var leaf: RefractionLeaf;
    leaf.key = p.pixel * 64u + p.leaf;
    leaf.pending = select(0u, 1u, pending);
    leaf.radiance = path.radiance;
    leaf.truncated = luminance(path.truncated);
    leaf.moving = path.moving;
    leaf.end = path.end;
    leaf.albedo = path.albedo;
    refraction_leaves[k] = leaf;
}

/** A luz do caminho `p` que termina no nó `n` (o peso desde a câmera já com o trecho até ele). */
fn refraction_wave_finish(p: RefractionPathState, n: RefractionNode) {
    let moved = (p.flags & REFRACTION_FLAG_MOVED) != 0u || n.moved;
    let radiance = p.weight * n.radiance + p.gathered;
    let moving = select(p.moving, radiance, moved);
    refraction_wave_leaf(p, RefractionPath(radiance, p.weight * n.truncated + p.truncated, n.end, n.albedo, moving),
        false);
}

/** O caminho `p` perdido (sem luz além da já somada) que termina em `end`. */
fn refraction_wave_lost(p: RefractionPathState, end: vec4f, pending: bool) {
    let moved = (p.flags & REFRACTION_FLAG_MOVED) != 0u;
    refraction_wave_leaf(p, RefractionPath(p.gathered, p.truncated, end, vec3f(1.0),
        select(p.moving, p.gathered, moved)), pending);
}

/** O caminho segue a partir do nó `n` na direção `dir`, pela pilha `stack`, com o peso multiplicado por `w`. */
fn refraction_wave_continue(p0: RefractionPathState, n: RefractionNode, dir: vec3f, stack: RefractionStack,
    w: vec3f) -> RefractionPathState {
    var p = p0;
    p.weight *= w;
    p.dir = dir;
    p.stack = stack;
    p.origin = refraction_departure(n.p, n.nf, dir);
    p.side = refraction_side_after(n, dir);
    return p;
}

/**
 * Abre os ramos `b` de uma interface (nó `n`, pilha `stack`) do caminho `parent` como caminhos do estágio `stage`, com
 * as folhas `base + k × stride`: o primeiro na vaga do pai, os outros em vagas novas; sem vaga para todos, um ramo só,
 * sorteado pela luminância do peso e dividido pela probabilidade (sem viés). Devolve quantos seguem (na lista `next`).
 */
fn refraction_wave_branch(parent: RefractionPathState, slot: u32, n: RefractionNode, stack: RefractionStack,
    b: RefractionBranches, stage: u32, base: u32, stride: u32, next: u32, state: ptr<function, u32>) {
    var live = 0u;
    var total = 0.0;
    for (var k = 0u; k < b.count; k++) {
        if (any(b.weights[k] > vec3f(0.0))) {
            live++;
            total += max(luminance(b.weights[k]), 1e-6);
        }
    }
    if (live == 0u) { return; }
    var slots: array<u32, REFRACTION_BRANCHES>;
    var fits = true;
    var first = true;
    for (var k = 0u; k < b.count; k++) {
        slots[k] = NONE;
        if (!any(b.weights[k] > vec3f(0.0))) { continue; }
        if (first) {
            slots[k] = slot;
            first = false;
        } else {
            slots[k] = refraction_wave_alloc();
            fits = fits && slots[k] != NONE;
        }
    }
    // Sem vaga para todos: um ramo pela luminância do peso.
    var only = NONE;
    var scale = 1.0;
    if (!fits) {
        let u = refraction_random(state) * total;
        var acc = 0.0;
        for (var k = 0u; k < b.count; k++) {
            if (!any(b.weights[k] > vec3f(0.0))) { continue; }
            let l = max(luminance(b.weights[k]), 1e-6);
            acc += l;
            if (only == NONE && u < acc) {
                only = k;
                scale = total / l;
            }
        }
        if (only == NONE) { only = b.count - 1u; }
    }
    let after = refraction_after_node(stack, n);
    for (var k = 0u; k < b.count; k++) {
        if (!any(b.weights[k] > vec3f(0.0))) { continue; }
        if (!fits && k != only) { continue; }
        let at = select(slots[k], slot, !fits);
        var c = refraction_wave_continue(parent, n, b.dirs[k], refraction_stack_pick(stack, after, b.crossed[k]),
            b.weights[k] * scale);
        c.stage = stage;
        c.steps = 0u;
        c.channel = b.channels[k];
        c.leaf = base + k * stride;
        c.state = pcg_hash(*state ^ (0x9e3779b9u * (k + 1u)));
        c.gathered = vec3f(0.0);
        c.moving = vec3f(0.0);
        c.truncated = vec3f(0.0);
        refraction_paths[at] = c;
        refraction_wave_push(next, at);
    }
}

// ---- A fila ----

/** Zera a fila (antes das raízes): a lista 0 corrente, as contagens, o bloco, as vagas e as folhas. */
@compute @workgroup_size(1)
fn refraction_wave_reset_main() {
    for (var k = 0u; k < REFRACTION_QUEUE_LISTS; k++) { atomicStore(&refraction_path_queue[k], 0u); }
}

/**
 * As raízes: um caminho por pixel da fila (no estágio do acerto da câmera, a folha 0), o raio da câmera do pixel com o
 * deslocamento da amostra do quadro, o estado do sorteio do pixel e a pilha da câmera; as vagas das raízes são as
 * primeiras.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_wave_roots_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let q = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = min(textureLoad(refraction_frame, vec2u(REFRACTION_FRAME_COUNT, 0u), 0).x, refraction_wave_slots());
    if (q == 0u) { atomicMax(&refraction_path_queue[4], count); }
    if (q >= count) { return; }
    let size = textureDimensions(refraction_queue_in);
    let pixel = textureLoad(refraction_queue_in, vec2u(q % size.x, q / size.x), 0).x;
    let px = vec2u(pixel % size.x, pixel / size.x);
    let ray = camera_ray(refraction.camera_slot, vec2f(px) + 0.5, vec2f(size));
    var p: RefractionPathState;
    p.pixel = pixel;
    p.leaf = 0u;
    p.stage = REFRACTION_STAGE_SAMPLE;
    p.steps = 0u;
    p.origin = ray.origin + ray.dir * ray.near;
    p.dir = ray.dir;
    p.side = -1;
    p.channel = -1;
    p.weight = vec3f(1.0);
    p.interfaces = 0u;
    p.state = refraction_seed(pixel, refraction.frame);
    p.flags = 0u;
    p.stack = refraction_camera_stack();
    // O plano próximo da câmera (o acerto da câmera soma a absorção desde ele): até a primeira interface o campo da
    // dispersão está livre.
    p.disp_alpha = ray.near;
    refraction_paths[q] = p;
    refraction_wave_push(0u, q);
}

/** O começo de uma rodada: a lista seguinte vazia e o primeiro bloco da corrente. */
@compute @workgroup_size(1)
fn refraction_wave_round_main() {
    let current = atomicLoad(&refraction_path_queue[0]);
    atomicStore(&refraction_path_queue[2u - current], 0u);
    atomicStore(&refraction_path_queue[3], 0u);
    refraction_wave_chunk_args(current, 0u);
}

/** O bloco seguinte da rodada. */
@compute @workgroup_size(1)
fn refraction_wave_chunk_main() {
    let current = atomicLoad(&refraction_path_queue[0]);
    let start = atomicLoad(&refraction_path_queue[3]) + REFRACTION_WAVE;
    atomicStore(&refraction_path_queue[3], start);
    refraction_wave_chunk_args(current, start);
}

/** O fim da rodada: a lista seguinte vira a corrente. */
@compute @workgroup_size(1)
fn refraction_wave_swap_main() {
    atomicStore(&refraction_path_queue[0], 1u - atomicLoad(&refraction_path_queue[0]));
}

/** Caminhos por bloco: metade da capacidade da onda (duas entradas por caminho). */
override REFRACTION_WAVE: u32 = 65536u;

fn refraction_wave_chunk_args(list: u32, start: u32) {
    let live = min(atomicLoad(&refraction_path_queue[1u + list]), refraction_wave_slots());
    atomicStore(&refraction_path_queue[6], select(0u, min(live - start, REFRACTION_WAVE), live > start));
}

// ---- Uma rodada ----

/**
 * O acerto seguinte de cada caminho do bloco (o da refração: a malha ou a superfície de um volume) e a dielétrica
 * coincidente na onda (as entradas 2j e 2j + 1), guardados no estado; o escape, sem entrada.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_wave_hit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let slot = refraction_wave_chunk_path(j);
    if (slot == NONE) { return; }
    let p = refraction_paths[slot];
    let hit = refraction_scene_hit(p.origin, p.dir, REFRACTION_FAR, p.side);
    refraction_paths[slot].hit_t = hit.t;
    refraction_paths[slot].hit_instance = hit.instance;
    refraction_paths[slot].hit_face = hit.face;
    refraction_paths[slot].hit_renderable = hit.renderable;
    refraction_paths[slot].hit_primitive = hit.primitive;
    refraction_paths[slot].hit_position = hit.position;
    refraction_paths[slot].hit_normal = hit.normal;
    refraction_paths[slot].other_instance = NONE;
    if (hit.instance == NONE) {
        ray_wave_put_empty(2u * j, vec4f(0.0));
        ray_wave_put_empty(2u * j + 1u, vec4f(0.0));
        return;
    }
    refraction_wave_put(2u * j, hit, refraction.time, vec4f(1.0));
    let other = refraction_coincident(p.origin, p.dir, hit);
    refraction_paths[slot].other_instance = other.instance;
    refraction_paths[slot].other_face = other.face;
    if (other.instance == NONE) {
        ray_wave_put_empty(2u * j + 1u, vec4f(0.0));
    } else {
        refraction_wave_put(2u * j + 1u, other, refraction.time, vec4f(1.0));
    }
}

/** O nó do acerto do caminho `p` (bloco `j`) pelos fechamentos avaliados na onda. */
fn refraction_wave_node(p: RefractionPathState, j: u32, state: ptr<function, u32>) -> RefractionNode {
    return refraction_node_at(p.origin, p.dir, refraction_wave_hit_of(p), ray_wave_entries[2u * j].closure,
        refraction_wave_other_of(p), ray_wave_entries[2u * j + 1u].closure, p.stack, p.channel, p.interfaces, state);
}

/**
 * O acerto da câmera (`refraction_sample`): o escape (o ambiente), o opaco (a luz dele) ou a primeira interface — a
 * parede fina (a reflexão e a passagem), a borda que não muda o meio (segue reto) ou a interface dielétrica (a mesma
 * microfaceta para os dois lobos, o Fresnel por canal; com dispersão, um caminho por canal): os ramos, cada um no estágio
 * do caminho até a segunda interface, com a folha ramo × 16.
 */
fn refraction_wave_sample(p0: RefractionPathState, slot: u32, j: u32, next: u32) {
    var p = p0;
    var state = p.state;
    let hit = refraction_wave_hit_of(p);
    let d = p.dir;
    let near = p.disp_alpha;
    let through = refraction_absorb(vec3f(1.0), refraction_current(p.stack), min(hit.t + near, REFRACTION_FAR));
    if (hit.instance == NONE) {
        let radiance = through * scene_environment(d);
        refraction_wave_leaf(p, RefractionPath(radiance, vec3f(0.0), refraction_end(p.origin + d * REFRACTION_FAR, NONE),
            vec3f(1.0), vec3f(0.0)), false);
        return;
    }
    let c = ray_wave_entries[2u * j].closure;
    let first_moved = refraction_hit_moved(hit);
    if (!refraction_takes_interface(c, &state)) {
        let shade = refraction_shade(c, hit, -d, state);
        let radiance = through * shade.xyz;
        refraction_wave_leaf(p, RefractionPath(radiance, vec3f(0.0), refraction_end(hit.position, hit.renderable),
            closure_albedo(c), select(vec3f(0.0), radiance, first_moved || shade.w > 0.0)), false);
        return;
    }
    let volume = refraction_is_volume(hit.instance);
    var b: RefractionBranches;
    b.count = 0u;
    var n: RefractionNode;
    n.p = hit.position;
    n.nf = select(hit.normal, -hit.normal, dot(hit.normal, d) > 0.0);
    n.vol = volume;
    n.vol_n = hit.normal;
    n.count = 0u;
    if (c.transmission_thin > 0.0) {
        let thin = refraction_thin(c, hit, d, refraction_current(p.stack));
        b.dirs[0] = thin.reflect_dir;
        b.weights[0] = thin.reflect_weight;
        b.channels[0] = -1;
        b.crossed[0] = false;
        b.dirs[1] = d;
        b.weights[1] = thin.transmit_weight;
        b.channels[1] = -1;
        b.crossed[1] = false;
        b.count = 2u;
    } else {
        let x = refraction_crossing_at(d, hit, c, refraction_wave_other_of(p), ray_wave_entries[2u * j + 1u].closure,
            p.stack);
        n.p = x.p;
        n.nf = x.nf;
        n.first = x.first;
        n.second = x.second;
        n.count = x.count;
        if (!x.crosses) {
            // A borda não muda o meio: segue reto, na pilha de depois.
            b.dirs[0] = d;
            b.weights[0] = vec3f(1.0);
            b.channels[0] = -1;
            b.crossed[0] = true;
            b.count = 1u;
        } else {
            let u = vec2f(refraction_random(&state), refraction_random(&state));
            let m = refraction_microfacet(d, x.ns, x.alpha, u);
            b = refraction_branches(d, m, x.ns, x.nf, x.alpha, x.before.ior, x.next.ior,
                refraction_dispersive(x.before) || refraction_dispersive(x.next));
        }
    }
    p.weight = through;
    p.interfaces = 1u;
    p.flags = select(0u, REFRACTION_FLAG_MOVED, first_moved);
    // O lado quanto aos volumes, depois da superfície de um: pela direção do ramo contra a normal para fora dele (o nó
    // de volume dá `refraction_side_after`).
    refraction_wave_branch(p, slot, n, p.stack, b, REFRACTION_STAGE_SPLIT, 0u, 16u, next, &state);
}

/**
 * Um passo do caminho até a segunda interface (`refraction_path_split`): o fim, a borda que não muda o meio (segue reto)
 * ou a interface — os dois lobos (ou a reflexão e um caminho por canal), cada um no estágio do caminho de um lobo, com a
 * folha + ramo × 4.
 */
fn refraction_wave_split(p0: RefractionPathState, slot: u32, n: RefractionNode, next: u32,
    state: ptr<function, u32>) {
    var p = p0;
    p.weight *= n.through;
    if (n.done) {
        refraction_wave_finish(p, n);
        return;
    }
    if (n.moved) { p.flags |= REFRACTION_FLAG_MOVED; }
    p.channel = n.channel;
    p.interfaces = n.interfaces;
    if (n.passes) {
        p = refraction_wave_continue(p, n, p.dir, refraction_after_node(p.stack, n), vec3f(1.0));
        p.steps += 1u;
        p.state = *state;
        if (p.steps >= REFRACTION_STEP_LIMIT) {
            refraction_wave_leaf(p, RefractionPath(vec3f(0.0), p.weight, refraction_end(p.origin, NONE), vec3f(1.0),
                vec3f(0.0)), false);
            return;
        }
        refraction_paths[slot] = p;
        refraction_wave_push(next, slot);
        return;
    }
    var b: RefractionBranches;
    if (n.disperse) {
        b = refraction_branches(p.dir, n.m, n.ns, n.nf, n.alpha, n.ior_before, n.ior_next, true);
    } else {
        b.dirs[0] = n.reflect_dir;
        b.weights[0] = n.reflect_weight;
        b.channels[0] = p.channel;
        b.crossed[0] = false;
        b.dirs[1] = n.transmit_dir;
        b.weights[1] = n.transmit_weight;
        b.channels[1] = p.channel;
        b.crossed[1] = true;
        b.count = 2u;
    }
    refraction_wave_branch(p, slot, n, p.stack, b, REFRACTION_STAGE_PATH, p.leaf, 4u, next, state);
}

/**
 * Abre um caminho por canal na interface em que a dispersão começa (guardada no estado), com a transmissão de cada canal
 * dividida por `share` (a probabilidade da escolha, ou 1 resolvido o raro), nas folhas + canal + 1.
 */
fn refraction_wave_disperse(p: RefractionPathState, slot: u32, share: f32, next: u32, state: ptr<function, u32>) {
    var n: RefractionNode;
    n.p = p.disp_p;
    n.nf = p.disp_nf;
    n.vol = p.disp_vol != 0u;
    n.vol_n = p.end.xyz;
    var b: RefractionBranches;
    b.count = 0u;
    for (var k = 0; k < 3; k++) {
        let t = refraction_transmit(p.disp_d, p.disp_m, p.disp_ns, p.disp_nf, p.ior_before[k], p.ior_next[k],
            p.disp_alpha);
        var w = vec3f(0.0);
        w[k] = (1.0 - p.disp_fv[k]) * t.weight / share;
        b.dirs[b.count] = t.dir;
        b.weights[b.count] = w;
        b.channels[b.count] = k;
        b.crossed[b.count] = false;
        b.count += 1u;
    }
    // A pilha de depois dos cruzamentos já está em `other_stack`.
    refraction_wave_branch(p, slot, n, p.other_stack, b, REFRACTION_STAGE_PATH, p.leaf + 1u, 1u, next, state);
}

/**
 * Um passo do caminho de um lobo (`refraction_path`) no nó `n`: o fim, a borda que não muda o meio, ou a interface — o
 * lobo raro olhado antes quando o peso passa de `REFRACTION_LOOK_WEIGHT` (o caminho traça o raro na rodada seguinte e
 * guarda o outro), senão a roleta de Fresnel; onde a dispersão começa e a transmissão é escolhida, um caminho por canal.
 */
fn refraction_wave_step(p0: RefractionPathState, slot: u32, n: RefractionNode, next: u32,
    state: ptr<function, u32>) {
    var p = p0;
    p.weight *= n.through;
    if (n.done) {
        refraction_wave_finish(p, n);
        return;
    }
    if (n.moved) { p.flags |= REFRACTION_FLAG_MOVED; }
    p.channel = n.channel;
    p.interfaces = n.interfaces;
    p.steps += 1u;
    if (n.passes) {
        p = refraction_wave_continue(p, n, p.dir, refraction_after_node(p.stack, n), vec3f(1.0));
        refraction_wave_advance(p, slot, next, state);
        return;
    }
    var f = n.reflect_weight;
    var p_reflect = n.p_reflect;
    var reflect_dir = n.reflect_dir;
    var reflect_weight = n.reflect_weight;
    if (n.disperse) {
        let cos_m = dot(-p.dir, n.m);
        f = vec3f(
            refraction_fresnel(cos_m, n.ior_before.x, n.ior_next.x),
            refraction_fresnel(cos_m, n.ior_before.y, n.ior_next.y),
            refraction_fresnel(cos_m, n.ior_before.z, n.ior_next.z),
        );
        p_reflect = clamp((f.x + f.y + f.z) / 3.0, 1e-4, 1.0 - 1e-4);
        let r = refraction_reflect(p.dir, n.m, n.ns, n.nf, n.alpha);
        reflect_dir = r.dir;
        reflect_weight = f * r.weight;
        p.disp_p = n.p;
        p.disp_nf = n.nf;
        p.disp_ns = n.ns;
        p.disp_m = n.m;
        p.disp_d = p.dir;
        p.disp_alpha = n.alpha;
        p.ior_before = n.ior_before;
        p.ior_next = n.ior_next;
        p.disp_fv = f;
        p.disp_vol = select(0u, 1u, n.vol);
        p.end = vec4f(n.vol_n, 0.0);
    }
    let rare_reflect = p_reflect <= 0.5;
    let rare_weight = select(n.transmit_weight, reflect_weight, rare_reflect);
    let resolved = (rare_reflect || !n.disperse) && all(rare_weight <= vec3f(0.0));
    let u = refraction_random(state);
    let after = refraction_after_node(p.stack, n);
    if (!resolved && (rare_reflect || !n.disperse) && any(p.weight >= vec3f(REFRACTION_LOOK_WEIGHT))) {
        // O lobo raro olhado antes: o caminho o traça na rodada seguinte e guarda o outro.
        let rare_dir = select(n.transmit_dir, reflect_dir, rare_reflect);
        p.look_u = u;
        p.p_reflect = p_reflect;
        p.rare_reflect = select(0u, 1u, rare_reflect);
        p.disperse = select(0u, 1u, n.disperse);
        p.rare_weight = rare_weight;
        p.other_dir = select(reflect_dir, n.transmit_dir, rare_reflect);
        p.other_weight = select(reflect_weight, n.transmit_weight, rare_reflect);
        p.other_crossed = select(0u, 1u, rare_reflect);
        p.other_stack = refraction_stack_pick(p.stack, after, rare_reflect);
        p.other_side = refraction_side_after(n, p.other_dir);
        p.disp_p = n.p;
        p.disp_nf = n.nf;
        p.disp_vol = select(0u, 1u, n.vol);
        p.end = vec4f(n.vol_n, 0.0);
        let look_stack = refraction_stack_pick(after, p.stack, rare_reflect);
        p.dir = rare_dir;
        p.stack = look_stack;
        p.origin = refraction_departure(n.p, n.nf, rare_dir);
        p.side = refraction_side_after(n, rare_dir);
        p.stage = REFRACTION_STAGE_LOOK;
        p.state = *state;
        refraction_paths[slot] = p;
        refraction_wave_push(next, slot);
        return;
    }
    // Sem olhar: resolvido o raro, o outro lobo sem roleta; senão a roleta.
    let crossed = select(u >= p_reflect, rare_reflect, resolved);
    let prob = select(select(p_reflect, 1.0 - p_reflect, crossed), 1.0, resolved);
    if (n.disperse && crossed) {
        p.other_stack = after;
        refraction_wave_lost(p, n.end, true);
        refraction_wave_disperse(p, slot, prob, next, state);
        return;
    }
    let dir = select(reflect_dir, n.transmit_dir, crossed);
    let weight = select(reflect_weight, n.transmit_weight, crossed) / prob;
    if (all(weight <= vec3f(0.0))) {
        refraction_wave_lost(p, n.end, false);
        return;
    }
    p = refraction_wave_continue(p, n, dir, refraction_stack_pick(p.stack, after, crossed), weight);
    refraction_wave_advance(p, slot, next, state);
}

/** O caminho do estágio do lobo segue para o próximo acerto (ou para no teto de passos: a energia conta como truncada). */
fn refraction_wave_advance(p0: RefractionPathState, slot: u32, next: u32, state: ptr<function, u32>) {
    var p = p0;
    p.state = *state;
    p.stage = REFRACTION_STAGE_PATH;
    if (p.steps >= REFRACTION_STEP_LIMIT) {
        p.truncated += p.weight;
        refraction_wave_lost(p, refraction_end(p.origin, NONE), false);
        return;
    }
    refraction_paths[slot] = p;
    refraction_wave_push(next, slot);
}

/**
 * A decisão do lobo raro olhado (o nó `ahead` do acerto dele): terminou → a luz dele entra com o peso exato e o caminho
 * segue pelo outro; senão a roleta de Fresnel (o número sorteado antes de olhar) — escolhido o raro, o caminho segue do
 * acerto dele (já traçado); o outro, segue por ele. Onde a dispersão começa e a transmissão é escolhida, um caminho por
 * canal.
 */
fn refraction_wave_look(p0: RefractionPathState, slot: u32, ahead: RefractionNode, next: u32,
    state: ptr<function, u32>) {
    var p = p0;
    let rare_reflect = p.rare_reflect != 0u;
    if (ahead.done) {
        // Resolvido: a luz do raro com o peso exato.
        let w = p.weight * p.rare_weight * ahead.through;
        let radiance = w * ahead.radiance;
        let moved = (p.flags & REFRACTION_FLAG_MOVED) != 0u || ahead.moved;
        p.gathered += radiance;
        p.moving += select(vec3f(0.0), radiance, moved);
        p.truncated += w * ahead.truncated;
    } else {
        let crossed = p.look_u >= p.p_reflect;
        if (crossed != rare_reflect) {
            // Escolhido o raro: o caminho segue do acerto dele.
            p.weight *= p.rare_weight / select(p.p_reflect, 1.0 - p.p_reflect, crossed);
            p.stage = REFRACTION_STAGE_PATH;
            refraction_wave_step(p, slot, ahead, next, state);
            return;
        }
    }
    let share = select(select(p.p_reflect, 1.0 - p.p_reflect, rare_reflect), 1.0, ahead.done);
    // O outro lobo (a transmissão, quando o raro é a reflexão).
    if (p.disperse != 0u && rare_reflect) {
        refraction_wave_lost(p, refraction_end(p.disp_p, NONE), true);
        refraction_wave_disperse(p, slot, share, next, state);
        return;
    }
    let weight = p.other_weight / share;
    if (all(weight <= vec3f(0.0))) {
        refraction_wave_lost(p, refraction_end(p.disp_p, NONE), false);
        return;
    }
    p.weight *= weight;
    p.dir = p.other_dir;
    p.stack = p.other_stack;
    p.side = p.other_side;
    p.origin = refraction_departure(p.disp_p, p.disp_nf, p.other_dir);
    refraction_wave_advance(p, slot, next, state);
}

/** A continuação de uma rodada: o passo de cada caminho do bloco pelo estágio dele. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_wave_follow_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let slot = refraction_wave_chunk_path(j);
    if (slot == NONE) { return; }
    let p = refraction_paths[slot];
    let next = 1u - atomicLoad(&refraction_path_queue[0]);
    if (p.stage == REFRACTION_STAGE_SAMPLE) {
        refraction_wave_sample(p, slot, j, next);
        return;
    }
    var state = p.state;
    let n = refraction_wave_node(p, j, &state);
    if (p.stage == REFRACTION_STAGE_SPLIT) {
        refraction_wave_split(p, slot, n, next, &state);
    } else if (p.stage == REFRACTION_STAGE_LOOK) {
        refraction_wave_look(p, slot, n, next, &state);
    } else {
        refraction_wave_step(p, slot, n, next, &state);
    }
}

/** Depois da última rodada: o que resta vivo conta como truncado (o teto de passos). */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_wave_truncate_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let current = atomicLoad(&refraction_path_queue[0]);
    let live = min(atomicLoad(&refraction_path_queue[1u + current]), refraction_wave_slots());
    if (j >= live) { return; }
    var p = refraction_paths[refraction_wave_at(current, j)];
    p.truncated += p.weight;
    refraction_wave_lost(p, refraction_end(p.origin, NONE), false);
}

// ---- O fechamento por pixel ----

/** As chaves e os valores das folhas para a ordenação, e a contagem delas no registro `SetCount` da ordenação. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_wave_keys_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = min(atomicLoad(&refraction_path_queue[5]), arrayLength(&refraction_leaves));
    if (i == 0u) { refraction_leaf_count[0] = count; }
    if (i >= count) { return; }
    refraction_leaf_keys[i] = refraction_leaves[i].key;
    refraction_leaf_values[i] = i;
}

/**
 * Depois de ordenadas as chaves das folhas: a primeira folha de cada pixel soma as do pixel na ordem das chaves (a luz,
 * a energia truncada, a parte em movimento) e escolhe o fim pela folha de maior luminância (as que pararam na dispersão
 * não disputam), com o albedo pela média pesada pela luz; grava a radiância, o fim e o albedo do pixel.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn refraction_wave_resolve_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = min(atomicLoad(&refraction_path_queue[5]), arrayLength(&refraction_leaves));
    if (i >= count) { return; }
    let key = refraction_leaf_keys[i];
    let pixel = key / 64u;
    if (i > 0u && refraction_leaf_keys[i - 1u] / 64u == pixel) { return; }
    var radiance = vec3f(0.0);
    var truncated = 0.0;
    var moving = vec3f(0.0);
    var end = refraction_end(vec3f(0.0), NONE);
    var best = -1.0;
    var albedo = vec3f(0.0);
    var light = 0.0;
    var albedo_best = vec3f(1.0);
    for (var k = 0u; k < 64u && i + k < count; k++) {
        if (refraction_leaf_keys[i + k] / 64u != pixel) { break; }
        let leaf = refraction_leaves[refraction_leaf_values[i + k]];
        radiance += leaf.radiance;
        truncated += leaf.truncated;
        moving += leaf.moving;
        if (leaf.pending != 0u) { continue; }
        let l = luminance(leaf.radiance);
        albedo += l * leaf.albedo;
        light += l;
        if (l > best) {
            best = l;
            end = leaf.end;
            albedo_best = leaf.albedo;
        }
    }
    let size = textureDimensions(refraction_queue_in);
    let px = vec2u(pixel % size.x, pixel / size.x);
    let a = select(albedo_best, albedo / light, light > 0.0);
    textureStore(refraction_radiance_out, px, vec4f(radiance, truncated));
    textureStore(refraction_hit_out, px, end);
    let moved = clamp(luminance(moving) / max(luminance(radiance), 1e-6), 0.0, 1.0);
    textureStore(refraction_albedo_out, px, vec4f(a, moved));
}
