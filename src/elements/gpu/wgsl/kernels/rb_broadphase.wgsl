// Broadphase do LCP (spec 007, research R9): proxies (esfera envolvente de cada collider de caixa e de esfera na pose
// predita do passo), grade hash e pares candidatos por forma, com os argumentos do despacho indireto da narrowphase.
//
// Um par (corpo i, collider j) só gera contato se a distância de SDF entre eles for menor que a margem preditiva do
// substep (|v_ponto|·dt_sub, com v_ponto = v + ω × r do corpo i). Proxies e grade usam a pose predita, fixa no passo
// (uma vez por passo); os pares são gerados em cada substep com a velocidade daquele substep, e a esfera envolvente do
// corpo ampliada por `margin_scale × (|v| + |ω|·R) · dt_sub + skin` cobre todos os pares com contato — o conjunto de
// contatos é o da narrowphase exaustiva (FR-015).
// Requer: structs RigidBody, RBSimParams, BoxCollider, SphereCollider, CandidatePair, BroadphaseParams,
// HashGridParams; spatial_hash; quat.

const BP_BODY_BOX: u32 = 1u;
const NO_OWNER: u32 = NONE;

// Raio do proxy: positivo na grade; negativo (−raio) para os grandes, testados à parte.
fn proxy_of(center: vec3f, radius: f32) -> vec4f {
    return vec4f(center, select(radius, -radius, radius > bp_params.large_radius));
}

fn owner_center(owner: u32, local_center: vec3f, static_center: vec3f) -> vec3f {
    if (owner == NO_OWNER || owner >= rb_params.body_count) { return static_center; }
    return bodies[owner].pos_pred.xyz + quat_rotate_vec(bodies[owner].rot_pred, local_center);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_proxies_box_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= bp_params.box_count) { return; }
    let box = boxes[j];
    let center = owner_center(box_owners[j], box.center.xyz, box.center.xyz);
    proxies[j] = proxy_of(center, length(box.halfExtents.xyz));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_proxies_sphere_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= bp_params.sphere_count) { return; }
    let sph = spheres[j];
    let center = owner_center(sphere_owners[j], sph.center.xyz, sph.center.xyz);
    proxies[bp_params.box_count + j] = proxy_of(center, abs(sph.radius));
}

// ── Pares candidatos ─────────────────────────────────────────────────────────

fn emit_pair(body: u32, proxy: u32) {
    let is_box = proxy < bp_params.box_count;
    let slot = select(proxy - bp_params.box_count, proxy, is_box);
    var k: u32;
    if (is_box) { k = atomicAdd(&pair_counts.boxes, 1u); } else { k = atomicAdd(&pair_counts.spheres, 1u); }
    if (k >= bp_params.pair_capacity) {
        atomicAdd(&pair_counts.overflow, 1u);
        return;
    }
    if (is_box) {
        box_pairs[k] = CandidatePair(body, slot);
    } else {
        sphere_pairs[k] = CandidatePair(body, slot);
    }
}

fn overlaps(center: vec3f, reach: f32, proxy: vec4f) -> bool {
    let r = reach + abs(proxy.w);
    let d = center - proxy.xyz;
    return dot(d, d) < r * r;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_candidate_pairs_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= rb_params.body_count) { return; }
    let body = bodies[i];
    // Corpo estático não gera contato (a narrowphase descarta inv_mass = 0).
    if (body.pos.w == 0.0) { return; }
    let center = body.pos_pred.xyz;
    let radius = select(body.body_shape.y, length(body.body_shape.yzw), u32(body.body_shape.x) == BP_BODY_BOX);
    // Rodado em cada substep, depois da gravidade e antes da narrowphase: a velocidade é a mesma que a narrowphase usa
    // na profundidade preditiva (d + v·n·dt_sub), então a margem cobre exatamente os pares que podem gerar contato.
    let dt_sub = rb_params.gravity.w;
    let speed = length(body.vel.xyz) + length(body.omega.xyz) * radius;
    let reach = radius + bp_params.margin_scale * speed * dt_sub + bp_params.skin;
    // Grandes: testados contra todos os corpos.
    for (var t = 0u; t < bp_params.large_count; t++) {
        let p = large[t];
        if (overlaps(center, reach, proxies[p])) { emit_pair(i, p); }
    }
    // Pequenos: células que a esfera ampliada alcança (o centro de um proxy dista no máximo o maior raio da borda).
    let span = reach + bp_params.max_small_radius;
    let lo = sh_cell(center - vec3f(span), grid.cell_size);
    let hi = sh_cell(center + vec3f(span), grid.cell_size);
    for (var cz = lo.z; cz <= hi.z; cz++) {
        for (var cy = lo.y; cy <= hi.y; cy++) {
            for (var cx = lo.x; cx <= hi.x; cx++) {
                let cell = vec3i(cx, cy, cz);
                let b = sh_hash(cell, grid.table_mask);
                let start = cell_start[b];
                let n = cell_count[b];
                for (var t = 0u; t < n; t++) {
                    let p = cell_items[start + t];
                    let proxy = proxies[p];
                    // Balde compartilhado por outra célula: o item é de lá.
                    if (any(sh_cell(proxy.xyz, grid.cell_size) != cell)) { continue; }
                    if (overlaps(center, reach, proxy)) { emit_pair(i, p); }
                }
            }
        }
    }
}

// ── Argumentos do despacho indireto da narrowphase (caixas, esferas) ─────────

// Grupos de 64 para os pares (até a capacidade), distribuídos em x/y dentro do limite por dimensão
// (como Dispatcher.invocations).
fn dispatch_of(pairs: u32) -> vec3u {
    let groups = (min(pairs, bp_params.pair_capacity) + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    return vec3u(min(groups, 65535u), select(1u, (groups + 65534u) / 65535u, groups > 65535u), 1u);
}

@compute @workgroup_size(1)
fn rb_pairs_indirect_main() {
    let b = dispatch_of(atomicLoad(&pair_counts.boxes));
    let s = dispatch_of(atomicLoad(&pair_counts.spheres));
    np_args.box_x = b.x;
    np_args.box_y = b.y;
    np_args.box_z = b.z;
    np_args.sphere_x = s.x;
    np_args.sphere_y = s.y;
    np_args.sphere_z = s.z;
}
