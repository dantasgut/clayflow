// Nós de geometria diferencial (spec 031, R12) sobre os campos da amostra de superfície da 010 (`SurfaceSample`; zeros
// nas geometrias sem geometria diferencial): a primeira forma (E, F, G) e o elemento de área √(EG − F²); as curvaturas
// (K, H, k₁ ≥ k₂), a curvatura total √((k₁² + k₂²)/2) e o índice de forma (2/π)·atan2(k₁ + k₂, k₁ − k₂) (1 calota
// convexa, 0 sela, −1 calota côncava); as direções principais tangentes — a de k₁ projetada no plano tangente e
// normalizada, a de k₂ = n × d₁ (zeros em ponto umbílico ou degenerado). E as ondulações (spec 034, T065b): a normal
// perturbada por oito trens de onda no plano perpendicular a `up`. E o espaço dos padrões de superfície (spec 011): a
// coordenada do padrão no uv com a largura do pixel e as tangentes nela (`uv_space`), e a normal perturbada pelo gradiente
// de uma altura dada nessa coordenada (`bump`).
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

struct NodeSurfaceUvSpace {
    p: vec2f,
    width: f32,
    du: vec3f,
    dv: vec3f,
    wrap: vec2f,
}

/**
 * Espaço do padrão (spec 011): a coordenada `p = uv · scale + offset` (`scale` repetições por unidade de uv, por eixo; 0
 * num eixo vale 1), a largura do pixel ou do cone em `p` (a maior das duas derivadas de tela), as tangentes de `p` em mundo
 * (∂posição/∂p: `dpdu / scale.x` e `dpdv / scale.y`) e o período de `p` numa volta do uv (`wrap` = |scale|: o que os
 * padrões usam para fechar sem emenda nas superfícies em que o uv dá a volta).
 */
fn node_surface_uv_space(uv: vec2f, duvdx: vec2f, duvdy: vec2f, dpdu: vec3f, dpdv: vec3f, scale: vec2f,
    offset: vec2f) -> NodeSurfaceUvSpace {
    let s = select(vec2f(1.0), scale, abs(scale) > vec2f(1e-9));
    return NodeSurfaceUvSpace(
        uv * s + offset,
        max(length(duvdx * s), length(duvdy * s)),
        dpdu / s.x,
        dpdv / s.y,
        abs(s),
    );
}

/**
 * Relevo (spec 011): a normal perturbada pela altura `h(p)` de gradiente `gradient` (∂h/∂p) sobre a superfície de
 * tangentes `du`, `dv` (∂posição/∂p, de `surface.uvSpace`) — n' = n − `strength` · L · ∇ₛh, com o gradiente de superfície
 * ∇ₛh = (h_u · dv × n + h_v · n × du) / (n · du × dv) (Mikkelsen 2020, "Surface Gradient Based Bump Mapping Framework")
 * e L = √|n · du × dv| o comprimento de uma unidade de `p` no ponto: `strength` é a altura em unidades de `p` (o relevo
 * acompanha o tamanho do padrão, não o do objeto). Sem tangentes (zero: os acertos dos raios), a normal sem mudança.
 */
fn node_surface_bump(normal: vec3f, du: vec3f, dv: vec3f, gradient: vec2f, strength: f32) -> vec3f {
    let n = select(vec3f(0.0, 0.0, 1.0), normalize(normal), dot(normal, normal) > 0.0);
    let det = dot(n, cross(du, dv));
    if (abs(det) < 1e-24) { return n; }
    let g = (gradient.x * cross(dv, n) + gradient.y * cross(n, du)) * (sqrt(abs(det)) / det);
    return normalize(n - strength * g);
}

/**
 * Relevo em milímetros (spec 011): a altura de um padrão — `value` com o gradiente `gradient` (∂/∂p) sobre a coordenada
 * de `surface.uvSpace`, de escala `wrap` (∂p/∂uv; o período dela) — vira o relevo (altura, ∂altura/∂u, ∂altura/∂v), em
 * milímetros e no uv da superfície: (`value` − `level`) · `height`, com `height` a altura em milímetros de uma unidade
 * do padrão e `level` o nível do padrão que fica na superfície. Relevos somam-se (`math.add3`). É a entrada de
 * `surface.reliefNormal` (a inclinação, no material) e de `surface.displacement` (a geometria).
 */
fn node_surface_relief(value: f32, gradient: vec2f, wrap: vec2f, height: f32, level: f32) -> vec3f {
    let w = select(vec2f(1.0), wrap, wrap > vec2f(1e-9));
    return vec3f((value - level) * height, height * gradient * w);
}

/**
 * Normal do relevo (spec 011): a normal de uma superfície de tangentes `dpdu`, `dpdv` (∂posição/∂uv) deslocada pelo
 * relevo `relief` (altura em mm e as derivadas no uv, de `surface.relief`), com `scale` unidades do mundo por metro —
 * n' = n − H · ∇ₛh, H = `scale`/1000 e ∇ₛh = (h_u · dpdv × n + h_v · n × dpdu) / (n · dpdu × dpdv) (o gradiente de
 * superfície de Mikkelsen 2020), com a inclinação |H · ∇ₛh| presa em 4 (76°). É a normal da geometria que
 * `surface.displacement` gera com o mesmo relevo. Sem tangentes (zero: os acertos dos raios), a normal sem mudança.
 */
fn node_surface_relief_normal(normal: vec3f, dpdu: vec3f, dpdv: vec3f, relief: vec3f, scale: f32) -> vec3f {
    let n = select(vec3f(0.0, 0.0, 1.0), normalize(normal), dot(normal, normal) > 0.0);
    let det = dot(n, cross(dpdu, dpdv));
    if (abs(det) < 1e-24) { return n; }
    var g = 0.001 * scale * (relief.y * cross(dpdv, n) + relief.z * cross(n, dpdu)) / det;
    // A inclinação fica até 4 (76°): uma parede mais íngreme que isso viraria a normal para trás da superfície.
    let slope = length(g);
    if (slope > 4.0) { g = g * (4.0 / slope); }
    return normalize(n - g);
}

/**
 * Saída do ponto `displacement` (spec 011): a altura do relevo `relief` (milímetros, de `surface.relief`) nas unidades
 * do mundo, com `scale` unidades por metro.
 */
fn node_surface_displacement(relief: vec3f, scale: f32) -> f32 {
    return relief.x * 0.001 * scale;
}

/**
 * Direção do padrão em mundo (spec 011): a direção `direction` dada na coordenada do padrão (a fibra de
 * `pattern.weave`/`pattern.knit`) levada às tangentes `du`, `dv` (∂posição/∂p, de `surface.uvSpace`) e normalizada — a
 * tangente do especular anisotrópico. Sem tangentes (os acertos dos raios), zero (o lobo fica isotrópico).
 */
fn node_surface_direction(du: vec3f, dv: vec3f, direction: vec2f) -> vec3f {
    let t = du * direction.x + dv * direction.y;
    let l = length(t);
    if (l < 1e-12) { return vec3f(0.0); }
    return t / l;
}
