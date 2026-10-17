// Enquadramento da vista da luz da água (spec 017; spec 033: pela caixa do campo dos fluidos): a mesma direção da luz
// que projeta sombra, com a projeção ortográfica ajustada à caixa da água (mais a margem da refração) — o mapa de
// cáusticas cobre só a água, com texels de milímetros em vez dos centímetros do mapa de sombra da cena.

// Base ortonormal da luz: as linhas da parte 3×3 da matriz do mapa de sombra, normalizadas (colunas do resultado);
// `transpose(base) * p` são as coordenadas de `p` na base.
fn water_light_basis(m: mat4x4f) -> mat3x3f {
    return mat3x3f(
        normalize(vec3f(m[0].x, m[1].x, m[2].x)),
        normalize(vec3f(m[0].y, m[1].y, m[2].y)),
        normalize(vec3f(m[0].z, m[1].z, m[2].z)),
    );
}

// Matriz ortográfica da vista da luz para a caixa [lo, hi] dada nas coordenadas da base: quadrado em xy (texels
// quadrados) com margem para a luz refratada que sai da projeção da água; z de 0 (topo da caixa, do lado da luz) a 1.
fn water_light_fit_box(lo: vec3f, hi: vec3f, basis: mat3x3f) -> mat4x4f {
    let extent = max(hi.xy - lo.xy, vec2f(1e-3));
    let half = 0.5 * max(extent.x, extent.y) * 1.25 + 0.05;
    let c = 0.5 * (lo.xy + hi.xy);
    let dz = max(hi.z - lo.z, 1e-3);
    let r0 = basis[0];
    let r1 = basis[1];
    let r2 = basis[2];
    return mat4x4f(
        vec4f(r0.x / half, r1.x / half, r2.x / dz, 0.0),
        vec4f(r0.y / half, r1.y / half, r2.y / dz, 0.0),
        vec4f(r0.z / half, r1.z / half, r2.z / dz, 0.0),
        vec4f(-c.x / half, -c.y / half, -lo.z / dz, 1.0),
    );
}
