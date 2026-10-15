// Partículas secundárias (spec 010), geração: (1) normal de superfície de cada partícula do fluido; (2) potenciais de
// ar aprisionado (Σ |v_ij| (1 − v̂_ij·x̂_ij) W), crista de onda (curvatura convexa onde a superfície avança) e energia
// cinética, e o número a gerar n = Φ_k (k_ta Φ_ta + k_wc Φ_wc) Δt com arredondamento aleatório determinístico; (3) com
// os deslocamentos da soma de prefixos dos números, cada partícula grava as suas no anel a partir do topo (lugares
// determinísticos); (4) o topo avança pelo total.
// Requer: structs DiffuseParams, DiffuseParticle; diffuse_common; pool_live.

@group(0) @binding(0)  var<uniform>             diffuse_params:  DiffuseParams;
@group(0) @binding(1)  var<storage, read>       fluid:           array<f32>;
@group(0) @binding(2)  var<storage, read>       fluid_live:      array<u32>;
@group(0) @binding(3)  var<storage, read>       neighbor_list:   array<u32>;
@group(0) @binding(4)  var<storage, read>       neighbor_count:  array<u32>;
@group(0) @binding(5)  var<storage, read_write> diffuse_normals: array<vec4f>;
@group(0) @binding(6)  var<storage, read_write> diffuse_counts:  array<u32>;
@group(0) @binding(7)  var<storage, read>       diffuse_offsets: array<u32>;
@group(0) @binding(8)  var<storage, read_write> diffuse:         array<DiffuseParticle>;
@group(0) @binding(9)  var<storage, read_write> diffuse_state:   array<u32>;

const DIFFUSE_MAX_PER_PARTICLE: u32 = 16u;

fn diffuse_alive(i: u32) -> bool {
    return i < diffuse_params.fluid_count && pool_live(fluid_live[i >> 5u], i)
        && diffuse_fluid_pos(i).y > -1.0e6;
}

// Normal de superfície (para fora do fluido) e quão de superfície a partícula é (w: |Σ|, 0 no interior).
@compute @workgroup_size(64)
fn diffuse_normals_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= diffuse_params.fluid_count) { return; }
    if (!diffuse_alive(i)) {
        diffuse_normals[i] = vec4f(0.0);
        return;
    }
    let xi = diffuse_fluid_pos(i);
    var sum = vec3f(0.0);
    let n = min(neighbor_count[i], diffuse_params.max_neighbors);
    for (var k = 0u; k < n; k++) {
        let j = neighbor_list[k * diffuse_params.list_stride + i];
        let d = xi - diffuse_fluid_pos(j);
        let r = length(d);
        if (r > 1e-9) { sum += d / r * diffuse_weight(r); }
    }
    let len = length(sum);
    diffuse_normals[i] = select(vec4f(0.0), vec4f(sum / len, len), len > 1e-6);
}

@compute @workgroup_size(64)
fn diffuse_potential_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= diffuse_params.fluid_count) { return; }
    if (!diffuse_alive(i)) {
        diffuse_counts[i] = 0u;
        return;
    }
    let xi = diffuse_fluid_pos(i);
    let vi = diffuse_fluid_vel(i);
    let ni = diffuse_normals[i];
    var trapped = 0.0;
    var crest = 0.0;
    let n = min(neighbor_count[i], diffuse_params.max_neighbors);
    for (var k = 0u; k < n; k++) {
        let j = neighbor_list[k * diffuse_params.list_stride + i];
        let xij = xi - diffuse_fluid_pos(j);
        let r = length(xij);
        if (r <= 1e-9) { continue; }
        let w = diffuse_weight(r);
        let vij = vi - diffuse_fluid_vel(j);
        let sv = length(vij);
        if (sv > 1e-9) { trapped += sv * (1.0 - dot(vij / sv, xij / r)) * w; }
        // Curvatura: só os vizinhos atrás da superfície (convexa).
        let nj = diffuse_normals[j];
        if (ni.w > 0.0 && nj.w > 0.0 && dot(-xij, ni.xyz) < 0.0) {
            crest += (1.0 - dot(ni.xyz, nj.xyz)) * w;
        }
    }
    let speed = length(vi);
    // Crista: só onde a superfície avança na direção da normal.
    let moving = speed > 1e-6 && ni.w > 0.0 && dot(vi / speed, ni.xyz) >= 0.6;
    let p = diffuse_params;
    let ta = diffuse_clamp(trapped, p.ta_min, p.ta_max);
    let wc = select(0.0, diffuse_clamp(crest, p.wc_min, p.wc_max), moving);
    let ek = diffuse_clamp(0.5 * speed * speed, p.k_min, p.k_max);
    let expected = ek * (p.k_ta * ta + p.k_wc * wc) * p.dt;
    let count = u32(floor(expected + diffuse_rand(i, p.frame, 0u)));
    diffuse_counts[i] = min(count, DIFFUSE_MAX_PER_PARTICLE);
}

// Base ortonormal perpendicular a d (unitário).
fn diffuse_basis(d: vec3f) -> mat2x3f {
    let a = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(d.x) > 0.9);
    let e1 = normalize(cross(d, a));
    return mat2x3f(e1, cross(d, e1));
}

@compute @workgroup_size(64)
fn diffuse_spawn_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= diffuse_params.fluid_count) { return; }
    let count = diffuse_counts[i];
    if (count == 0u) { return; }
    let p = diffuse_params;
    let xi = diffuse_fluid_pos(i);
    let vi = diffuse_fluid_vel(i);
    let speed = length(vi);
    let dir = select(vec3f(0.0, 1.0, 0.0), vi / speed, speed > 1e-6);
    let e = diffuse_basis(dir);
    let head = diffuse_state[0];
    for (var k = 0u; k < count; k++) {
        let slot = (head + diffuse_offsets[i] + k) % p.capacity;
        let xr = diffuse_rand(i, p.frame, 1u + 3u * k);
        let xt = diffuse_rand(i, p.frame, 2u + 3u * k);
        let xh = diffuse_rand(i, p.frame, 3u + 3u * k);
        // Cilindro em volta da partícula ao longo da velocidade (raio r_V, altura |v| Δt).
        let r = p.spawn_radius * sqrt(xr);
        let theta = 6.2831853 * xt;
        let radial = cos(theta) * e[0] + sin(theta) * e[1];
        var d: DiffuseParticle;
        d.pos = vec4f(xi + r * radial + xh * speed * p.dt * dir, DIFFUSE_SPRAY);
        d.vel = vec4f(vi + radial * p.spawn_spread * speed, p.lifetime * (0.5 + xr));
        diffuse[slot] = d;
    }
}

// Topo do anel: avança pelo total gerado (último deslocamento + última contagem).
@compute @workgroup_size(1)
fn diffuse_head_main() {
    let n = diffuse_params.fluid_count;
    if (n == 0u) { return; }
    let total = diffuse_offsets[n - 1u] + diffuse_counts[n - 1u];
    diffuse_state[0] = (diffuse_state[0] + total) % diffuse_params.capacity;
    diffuse_state[1] = total;
}
