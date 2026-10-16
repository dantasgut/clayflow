// Partículas secundárias (spec 010), um passo: cada partícula viva conta as partículas do fluido em volta (pela grade
// da busca de vizinhos: células, faixas e índices ordenados) e a velocidade média delas; pela vizinhança vira spray
// (poucos vizinhos: balística com arrasto do ar), espuma (na superfície: levada pelo fluido, se desfaz com o tempo) ou
// bolha (dentro: empuxo e arrasto para a velocidade do fluido). Sai da caixa do domínio: morre.
// Requer: structs DiffuseParams, DiffuseParticle; diffuse_common.

@compute @workgroup_size(WORKGROUP_SIZE)
fn diffuse_update_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let p = diffuse_params;
    if (i >= p.capacity) { return; }
    var d = diffuse[i];
    if (d.vel.w <= 0.0) { return; }
    let x = d.pos.xyz;
    // Vizinhos do fluido nas 27 células em volta.
    let rel = (x - p.grid_origin) / p.cell_size;
    let c = vec3i(floor(rel));
    let dims = vec3i(i32(p.grid_x), i32(p.grid_y), i32(p.grid_z));
    var count = 0u;
    var vsum = vec3f(0.0);
    var wsum = 0.0;
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                let q = c + vec3i(dx, dy, dz);
                if (any(q < vec3i(0)) || any(q >= dims)) { continue; }
                let cell = u32(q.x) + u32(q.y) * p.grid_x + u32(q.z) * p.grid_x * p.grid_y;
                let start = cell_start[cell];
                let n = cell_count[cell];
                for (var k = 0u; k < n; k++) {
                    let j = sorted_particles[start + k];
                    let r = length(x - diffuse_fluid_pos(j));
                    let w = diffuse_weight(r);
                    if (w <= 0.0) { continue; }
                    count++;
                    vsum += diffuse_fluid_vel(j) * w;
                    wsum += w;
                }
            }
        }
    }
    let vf = select(vec3f(0.0), vsum / wsum, wsum > 0.0);
    var v = d.vel.xyz;
    var life = d.vel.w;
    var kind = DIFFUSE_FOAM;
    let dt = p.dt;
    if (count < p.spray_max) {
        kind = DIFFUSE_SPRAY;
        v = (v + p.gravity * dt) / (1.0 + p.air_drag * dt);
        life -= dt * p.spray_aging;
    } else if (count > p.bubble_min) {
        kind = DIFFUSE_BUBBLE;
        v += -p.buoyancy * p.gravity * dt + p.bubble_drag * (vf - v);
        life -= dt * p.spray_aging;
    } else {
        // Espuma: levada pelo fluido; some com o tempo.
        v = vf;
        life -= dt;
    }
    let nx = x + v * dt;
    // Saiu da caixa do domínio (por baixo ou pelos lados): morre.
    if (nx.y < p.bound_min.y || nx.x < p.bound_min.x || nx.z < p.bound_min.z
        || nx.x > p.bound_max.x || nx.z > p.bound_max.z) {
        life = 0.0;
    }
    d.pos = vec4f(nx, kind);
    d.vel = vec4f(v, life);
    diffuse[i] = d;
}
