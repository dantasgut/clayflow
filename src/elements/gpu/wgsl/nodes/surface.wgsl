// Nós de geometria diferencial (spec 031, R12) sobre os campos da amostra de superfície da 010 (`SurfaceSample`; zeros
// nas geometrias sem geometria diferencial): a primeira forma (E, F, G) e o elemento de área √(EG − F²); as curvaturas
// (K, H, k₁ ≥ k₂), a curvatura total √((k₁² + k₂²)/2) e o índice de forma (2/π)·atan2(k₁ + k₂, k₁ − k₂) (1 calota
// convexa, 0 sela, −1 calota côncava); as direções principais tangentes — a de k₁ projetada no plano tangente e
// normalizada, a de k₂ = n × d₁ (zeros em ponto umbílico ou degenerado).
// Requer: nada.

struct NodeSurfaceMetric {
    e: f32,
    f: f32,
    g: f32,
    area: f32,
}

struct NodeSurfaceCurvature {
    gaussian: f32,
    mean: f32,
    k1: f32,
    k2: f32,
    curvedness: f32,
    shape_index: f32,
}

struct NodeSurfacePrincipal {
    d1: vec3f,
    d2: vec3f,
}

fn node_surface_metric(metric: vec3f) -> NodeSurfaceMetric {
    let det = max(metric.x * metric.z - metric.y * metric.y, 0.0);
    return NodeSurfaceMetric(metric.x, metric.y, metric.z, sqrt(det));
}

fn node_surface_curvature(curvature: vec4f) -> NodeSurfaceCurvature {
    let k1 = curvature.z;
    let k2 = curvature.w;
    return NodeSurfaceCurvature(
        curvature.x,
        curvature.y,
        k1,
        k2,
        sqrt(0.5 * (k1 * k1 + k2 * k2)),
        0.63661977 * atan2(k1 + k2, k1 - k2),
    );
}

fn node_surface_principal(principal: vec3f, normal: vec3f) -> NodeSurfacePrincipal {
    let n = select(vec3f(0.0), normalize(normal), dot(normal, normal) > 0.0);
    let t = principal - n * dot(n, principal);
    if (dot(t, t) <= 1e-12) {
        return NodeSurfacePrincipal(vec3f(0.0), vec3f(0.0));
    }
    let d1 = normalize(t);
    return NodeSurfacePrincipal(d1, cross(n, d1));
}
