// Nós de geometria diferencial (spec 031, R12) sobre os campos da amostra de superfície da 010 (`SurfaceSample`; zeros
// nas geometrias sem geometria diferencial): a primeira forma (E, F, G) e o elemento de área √(EG − F²); as curvaturas
// (K, H, k₁ ≥ k₂), a curvatura total √((k₁² + k₂²)/2) e o índice de forma (2/π)·atan2(k₁ + k₂, k₁ − k₂) (1 calota
// convexa, 0 sela, −1 calota côncava); as direções principais tangentes — a de k₁ projetada no plano tangente e
// normalizada, a de k₂ = n × d₁ (zeros em ponto umbílico ou degenerado). E as ondulações (spec 034, T065b): a normal
// perturbada por oito trens de onda no plano perpendicular a `up`.
// Requer: constants.

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

/** Trens de onda das ondulações. */
const NODE_SURFACE_RIPPLE_WAVES: u32 = 8u;

/**
 * Ondulações (spec 034, T065b): a altura h = Σ s/(8kᵢ)·sen(φᵢ) de oito trens de onda no plano perpendicular a `up`
 * (coordenadas (p·t₁, p·t₂)) — direções no ângulo áureo, comprimentos de `size` a ~⅓ dele, φᵢ = kᵢ d̂ᵢ·x − ωᵢ t + 2,17 i
 * com ωᵢ = √(g kᵢ)·`speed` (dispersão de águas profundas) — e a normal n − (∇h − (∇h·n) n), normalizada; ∇h analítico,
 * de módulo até `strength`, pesado por smoothstep(0,3; 0,8; n·up) (só nas faces voltadas para cima). A fase é reduzida a
 * [−π, π] antes do cosseno (a precisão do `cos` do WGSL só é garantida aí).
 */
fn node_surface_ripple(position: vec3f, normal: vec3f, time: f32, strength: f32, size: f32, speed: f32,
    up: vec3f) -> vec3f {
    let n = normalize(normal);
    let u = normalize(up);
    let w = smoothstep(0.3, 0.8, dot(n, u)) * strength;
    if (w <= 0.0 || size <= 0.0) { return n; }
    let a = select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(u.z) > 0.9);
    let t1 = normalize(cross(u, a));
    let t2 = cross(t1, u);
    let xz = vec2f(dot(position, t1), dot(position, t2));
    var slope = vec2f(0.0);
    for (var i = 0u; i < NODE_SURFACE_RIPPLE_WAVES; i++) {
        let angle = f32(i) * 2.3999632 + 0.4;
        let d = vec2f(cos(angle), sin(angle));
        let k = TAU / (size / (1.0 + 0.27 * f32(i)));
        let omega = sqrt(9.81 * k) * speed;
        let phase = k * dot(d, xz) - omega * time + f32(i) * 2.17;
        slope += d * cos(phase - TAU * round(phase / TAU));
    }
    slope *= w / f32(NODE_SURFACE_RIPPLE_WAVES);
    let g = t1 * slope.x + t2 * slope.y;
    return normalize(n - (g - n * dot(g, n)));
}
