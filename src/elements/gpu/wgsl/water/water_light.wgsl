// Enquadramento da vista da luz da água (spec 017): a mesma direção da luz que projeta sombra, com a projeção
// ortográfica ajustada na GPU à caixa envolvente das partículas de água (mais a margem da refração) — o mapa de cáusticas
// cobre só a água, com texels de milímetros em vez dos centímetros do mapa de sombra da cena. Structs `ShadowMatrix`,
// `WaterLightMatrix` e `WaterBoundsParams` gerados dos schemas.
@group(0) @binding(0) var<storage, read_write> light_bounds: array<atomic<u32>>;
@group(0) @binding(1) var<uniform> bounds_params: WaterBoundsParams;
@group(1) @binding(0) var<storage, read> shadow_matrices: array<ShadowMatrix>;
@group(1) @binding(1) var<storage, read> bounds_particles: array<vec4f>;
@group(2) @binding(0) var<storage, read_write> light_matrix: WaterLightMatrix;
@group(2) @binding(1) var<storage, read> bounds_in: array<u32>;

// Base ortonormal da luz: as linhas da parte 3×3 da matriz do mapa de sombra, normalizadas (colunas do resultado);
// `transpose(base) * p` são as coordenadas de `p` na base.
fn water_light_basis(m: mat4x4f) -> mat3x3f {
    return mat3x3f(
        normalize(vec3f(m[0].x, m[1].x, m[2].x)),
        normalize(vec3f(m[0].y, m[1].y, m[2].y)),
        normalize(vec3f(m[0].z, m[1].z, m[2].z)),
    );
}

// f32 → u32 com a mesma ordem (min/max por atomics).
fn water_ordered(f: f32) -> u32 {
    let b = bitcast<u32>(f);
    return select(~b, b | 0x80000000u, (b & 0x80000000u) == 0u);
}

fn water_unordered(u: u32) -> f32 {
    return bitcast<f32>(select(~u, u & 0x7fffffffu, (u & 0x80000000u) != 0u));
}

@compute @workgroup_size(1)
fn water_bounds_clear() {
    for (var i = 0u; i < 3u; i = i + 1u) {
        atomicStore(&light_bounds[i], 0xffffffffu);
        atomicStore(&light_bounds[3u + i], 0u);
    }
}

@compute @workgroup_size(64)
fn water_bounds_accumulate(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= bounds_params.count) { return; }
    let p = bounds_particles[(bounds_params.first + i) * bounds_params.strideVec4 + bounds_params.posOffsetVec4].xyz;
    // Não finita, ou retirada do domínio aberto do fluido (spec 010: muito abaixo da cena), fica fora do enquadramento.
    if (!all(abs(p) < vec3f(1e6))) { return; }
    let basis = water_light_basis(shadow_matrices[bounds_params.shadowSlot].lightViewProj);
    let q = transpose(basis) * p;
    let r = bounds_params.radius;
    for (var k = 0u; k < 3u; k = k + 1u) {
        atomicMin(&light_bounds[k], water_ordered(q[k] - r));
        atomicMax(&light_bounds[3u + k], water_ordered(q[k] + r));
    }
}

@compute @workgroup_size(1)
fn water_light_fit() {
    let lo = vec3f(water_unordered(bounds_in[0]), water_unordered(bounds_in[1]), water_unordered(bounds_in[2]));
    let hi = vec3f(water_unordered(bounds_in[3]), water_unordered(bounds_in[4]), water_unordered(bounds_in[5]));
    let basis = water_light_basis(shadow_matrices[bounds_params.shadowSlot].lightViewProj);
    // Quadrado em xy (texels quadrados) com margem para a luz refratada que sai da projeção da água.
    let extent = max(hi.xy - lo.xy, vec2f(1e-3));
    let half = 0.5 * max(extent.x, extent.y) * 1.25 + 0.05;
    let c = 0.5 * (lo.xy + hi.xy);
    let dz = max(hi.z - lo.z, 1e-3);
    let r0 = basis[0];
    let r1 = basis[1];
    let r2 = basis[2];
    light_matrix.viewProj = mat4x4f(
        vec4f(r0.x / half, r1.x / half, r2.x / dz, 0.0),
        vec4f(r0.y / half, r1.y / half, r2.y / dz, 0.0),
        vec4f(r0.z / half, r1.z / half, r2.z / dz, 0.0),
        vec4f(-c.x / half, -c.y / half, -lo.z / dz, 1.0),
    );
}
