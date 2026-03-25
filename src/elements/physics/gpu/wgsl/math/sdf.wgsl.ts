/**
 * Módulo WGSL: Signed Distance Functions (SDF) das formas de colisão.
 *
 * Mapeamento direto de SphereShape, BoxShape e PlaneShape.
 * Todas as SDFs operam no espaço LOCAL do collider.
 * Conversão world→local deve ser feita pelo chamador antes de invocar.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_SDF = /* wgsl */`

// ── Constante de epsilon para gradiente numérico ─────────────────────────────

const SDF_EPS: f32 = 1e-4;

// ── SDFs no espaço local do collider ─────────────────────────────────────────

// Esfera: f(p) = |p| - r
// Replica SphereShape.sdf()
fn sdf_sphere(p: vec3f, radius: f32) -> f32 {
    return length(p) - radius;
}

// Caixa (Inigo Quilez): q = |p| - h; f = |max(q,0)| + min(max(q),0)
// Replica BoxShape.sdf() — C2-contínua, SDF exata para OBB axis-aligned.
fn sdf_box(p: vec3f, half: vec3f) -> f32 {
    let q = abs(p) - half;
    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Semiespaço: f(p) = dot(p, n) - offset
// Replica PlaneShape.sdf() — n deve ser normalizado.
fn sdf_plane(p: vec3f, n: vec3f, offset: f32) -> f32 {
    return dot(p, n) - offset;
}

// ── Despacho por shape_type ───────────────────────────────────────────────────

// Avalia o SDF correto dado shape_type e parâmetros half de um ColliderDesc.
// shape_type: 0=Sphere (half.x=radius), 1=Box (half.xyz=half-extents), 2=Plane (half.xyz=normal, half.w=offset)
// Depende de: sdf_sphere, sdf_box, sdf_plane (acima).
fn eval_sdf(local_p: vec3f, shape_type: u32, half: vec4f) -> f32 {
    if (shape_type == 0u) { return sdf_sphere(local_p, half.x); }
    if (shape_type == 1u) { return sdf_box(local_p, half.xyz); }
    return sdf_plane(local_p, half.xyz, half.w);
}

// Gradiente numérico do SDF em local_p (diferenças finitas para frente).
// d é o valor já calculado em local_p — evita reavaliação.
// Depende de: eval_sdf, SDF_EPS.
fn sdf_gradient(local_p: vec3f, d: f32, shape_type: u32, half: vec4f) -> vec3f {
    let gx = eval_sdf(local_p + vec3f(SDF_EPS, 0.0,     0.0    ), shape_type, half) - d;
    let gy = eval_sdf(local_p + vec3f(0.0,     SDF_EPS, 0.0    ), shape_type, half) - d;
    let gz = eval_sdf(local_p + vec3f(0.0,     0.0,     SDF_EPS), shape_type, half) - d;
    return vec3f(gx, gy, gz);
}
`;
