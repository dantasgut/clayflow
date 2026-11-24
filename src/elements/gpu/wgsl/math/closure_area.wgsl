// Luz de área retangular (spec 011, R19): a resposta do fechamento à radiância uniforme de um retângulo emissor — a
// integral dos lobos sobre o retângulo, calculada por pixel, sem sorteio (nenhum ruído, nenhum estado entre quadros).
//
// Os lobos especulares (a base, com a anisotropia, e o verniz): o retângulo é partido pelas células de uma grade polar
// no plano das inclinações da micronormal — `CLOSURE_AREA_RINGS` anéis de massa conhecida da GGX (finos no meio do lobo,
// largos na cauda, até 97 % da massa) por `CLOSURE_AREA_SPOKES` raios. Cada canto da grade, refletido, cai num ponto do
// plano da luz; cada célula é um quadrilátero nesse plano, e o que dele está dentro do retângulo (o recorte exato) entra
// com o integrando exato — a BSDF vezes o cosseno na direção do centroide desse pedaço — vezes o ângulo sólido do
// pedaço; a célula inteira dentro entra com a massa exata dela. Lobo estreito: as células são pequenas no plano da luz e desenham a borda do
// retângulo com a largura delas (a imagem do painel num espelho, sem serrilha). Lobo largo: as células são maiores
// que o retângulo e ele entra inteiro, partido por elas. O custo é fixo: 48 cantos e 40 células por lobo e por luz. Erro medido contra a integral densa: até 3 % da energia
// do lobo.
//
// Os lobos largos (o difuso, a subsuperfície, a parede fina, o sheen, e o especular quando o lobo é largo diante do
// retângulo: `closure_area_wide`): os 4 × 4 pontos de Gauss-Legendre do retângulo.
// Referência f64: `material/reference/areaLight.ts`. Requer: closure_eval.

const CLOSURE_AREA_RINGS: u32 = 5u;
const CLOSURE_AREA_SPOKES: u32 = 8u;

// O retângulo emissor: o centro, os dois eixos unitários, a normal (o lado que emite) e as meias medidas.
struct ClosureAreaRect {
    center: vec3f,
    ax: vec3f,
    ay: vec3f,
    normal: vec3f,
    half: vec2f,
}

// Um pedaço do retângulo visto de um ponto: a direção para ele e o ângulo sólido.
struct ClosureAreaPiece {
    l: vec3f,
    omega: f32,
}

// O pedaço de área `area` em volta do ponto `at` do retângulo (nas coordenadas dele), visto de `p`.
fn closure_area_piece(rect: ClosureAreaRect, p: vec3f, at: vec2f, area: f32) -> ClosureAreaPiece {
    let d = rect.center + rect.ax * at.x + rect.ay * at.y - p;
    let dist2 = max(dot(d, d), 1e-12);
    let l = d * inverseSqrt(dist2);
    return ClosureAreaPiece(l, area * max(-dot(l, rect.normal), 0.0) / dist2);
}

// A massa acumulada da GGX até a borda `k` dos anéis.
fn closure_area_mass(k: u32) -> f32 {
    let u = array<f32, 6>(0.0, 0.2, 0.45, 0.7, 0.88, 0.97);
    return u[k];
}

// A inclinação (em unidades de α) da borda `k` dos anéis: r = √(u / (1 − u)), u a massa acumulada.
fn closure_area_ring(k: u32) -> f32 {
    let u = closure_area_mass(k);
    return sqrt(u / (1.0 - u));
}

// A área (com sinal, em z) e o centroide (xy) do polígono dos `n` primeiros vértices de `poly`.
fn closure_area_centroid(poly: array<vec2f, 8>, n: u32) -> vec3f {
    var area = 0.0;
    var c = vec2f(0.0);
    for (var i = 0u; i < n; i++) {
        let a = poly[i];
        let b = poly[(i + 1u) % n];
        let w = a.x * b.y - b.x * a.y;
        area += w;
        c += (a + b) * w;
    }
    if (abs(area) < 1e-30) { return vec3f(0.0); }
    return vec3f(c / (3.0 * area), 0.5 * area);
}

// O quadrilátero `quad` recortado pelo retângulo de meias medidas `half` centrado na origem (Sutherland-Hodgman: quatro
// bordas, até 8 vértices): a área (com sinal, em z) e o centroide (xy) do que sobra.
fn closure_area_clip(quad: array<vec2f, 8>, half: vec2f) -> vec3f {
    var poly = quad;
    var n = 4u;
    for (var e = 0u; e < 4u; e++) {
        let axis = e >> 1u;
        let side = select(-1.0, 1.0, (e & 1u) == 0u);
        var out: array<vec2f, 8>;
        var m = 0u;
        for (var i = 0u; i < n; i++) {
            let a = poly[i];
            let b = poly[(i + 1u) % n];
            let da = half[axis] + side * a[axis];
            let db = half[axis] + side * b[axis];
            if (da >= 0.0 && m < 8u) {
                out[m] = a;
                m++;
            }
            if ((da >= 0.0) != (db >= 0.0) && m < 8u) {
                out[m] = a + (b - a) * (da / (da - db));
                m++;
            }
        }
        poly = out;
        n = m;
        if (n < 3u) { return vec3f(0.0); }
    }
    return closure_area_centroid(poly, n);
}

// ∫ lobo · dω sobre o retângulo, para o lobo especular de normal `m`, tangente `t` (unitária, perpendicular a `m`) e α
// `alpha` (ao longo da tangente e da bitangente): o da base (`coat` falso) ou o do verniz.
fn closure_area_lobe(c: Closure, rect: ClosureAreaRect, p: vec3f, v: vec3f, m: vec3f, t: vec3f, alpha: vec2f,
    frame: mat3x3f, coat: bool) -> vec3f {
    let height = dot(p - rect.center, rect.normal);
    // O lobo inteiro (até a última borda) longe do retângulo: nada a somar.
    let to = rect.center - p;
    let far = length(to);
    let around = acos(clamp(dot(reflect(-v, m), to / max(far, 1e-6)), -1.0, 1.0));
    let lobe = 2.0 * atan(closure_area_ring(CLOSURE_AREA_RINGS) * max(alpha.x, alpha.y));
    if (around > lobe + asin(min(length(rect.half) / max(far, 1e-6), 1.0)) + 0.05) { return vec3f(0.0); }
    let b = cross(m, t);
    // Os cantos do anel anterior no plano da luz (xy, nas coordenadas do retângulo) e se valem (z).
    var prev: array<vec3f, 8>;
    var cur: array<vec3f, 8>;
    var sum = vec3f(0.0);
    for (var k = 0u; k <= CLOSURE_AREA_RINGS; k++) {
        let r = closure_area_ring(k);
        for (var j = 0u; j < CLOSURE_AREA_SPOKES; j++) {
            let phi = TAU * f32(j) / f32(CLOSURE_AREA_SPOKES);
            let h = normalize(m + t * (r * alpha.x * cos(phi)) + b * (r * alpha.y * sin(phi)));
            let l = reflect(-v, h);
            let down = dot(l, rect.normal);
            // A direção rasante ao plano da luz (ou para trás dele) não cai nele.
            if (down > -0.02) {
                cur[j] = vec3f(0.0);
            } else {
                let q = p - l * (height / down) - rect.center;
                cur[j] = vec3f(dot(q, rect.ax), dot(q, rect.ay), 1.0);
            }
        }
        if (k > 0u) {
            let mass = (closure_area_mass(k) - closure_area_mass(k - 1u)) / f32(CLOSURE_AREA_SPOKES);
            for (var j = 0u; j < CLOSURE_AREA_SPOKES; j++) {
                let j1 = (j + 1u) % CLOSURE_AREA_SPOKES;
                let qa = prev[j];
                let qb = prev[j1];
                let qc = cur[j1];
                let qd = cur[j];
                if (qa.z * qb.z * qc.z * qd.z == 0.0) { continue; }
                let lo = min(min(qa.xy, qb.xy), min(qc.xy, qd.xy));
                let hi = max(max(qa.xy, qb.xy), max(qc.xy, qd.xy));
                if (any(hi <= -rect.half) || any(lo >= rect.half)) { continue; }
                var cell: array<vec2f, 8>;
                cell[0] = qa.xy;
                cell[1] = qb.xy;
                cell[2] = qc.xy;
                cell[3] = qd.xy;
                let whole = closure_area_centroid(cell, 4u);
                if (whole.z == 0.0) { continue; }
                // A célula toda dentro do retângulo: ela mesma; senão, o recorte.
                var part = whole;
                if (any(lo < -rect.half) || any(hi > rect.half)) { part = closure_area_clip(cell, rect.half); }
                let inside = min(part.z / whole.z, 1.0);
                if (inside <= 0.0) { continue; }
                // O integrando no meio do pedaço vezes o ângulo sólido dele; com a célula quase toda dentro, a massa
                // exata dela no lugar da área (pela densidade do lobo no meio da célula): o lobo estreito não perde a
                // energia do pico.
                let piece = closure_area_piece(rect, p, part.xy, abs(part.z));
                let middle = closure_area_piece(rect, p, whole.xy, abs(whole.z));
                let hc = normalize(v + middle.l);
                let hs = vec3f(dot(t, hc) / alpha.x, dot(b, hc) / alpha.y, dot(m, hc));
                let dd = dot(hs, hs);
                let density = hs.z / (PI * alpha.x * alpha.y * dd * dd * 4.0 * max(dot(v, hc), 1e-6)) * middle.omega;
                // A razão entre a massa exata e a do ponto médio fica perto de 1 (de 0,9 a 1,5 nas células inteiras);
                // presa, para a célula deformada no rasante não pesar o que não tem.
                let exact = clamp(select(1.0, mass / density, density > 0.0), 0.5, 2.0);
                let weight = piece.omega * (1.0 + (exact - 1.0) * inside * inside);
                if (coat) {
                    sum += vec3f(closure_coat_lobe(c, m, v, piece.l)) * weight;
                } else {
                    sum += closure_base_lobe_in(c, frame, m, v, piece.l) * weight;
                }
            }
        }
        prev = cur;
    }
    return sum;
}

// O lobo especular de α `alpha` é largo diante do retângulo visto de `p`? — o menor α passa de 0,35 da meia diagonal
// do retângulo sobre a distância: o lobo varia pouco entre dois pontos de Gauss vizinhos, e a soma neles (16 pontos)
// vale pela grade do lobo (erro medido: abaixo de 3 % da energia do lobo).
fn closure_area_wide(rect: ClosureAreaRect, p: vec3f, alpha: vec2f) -> bool {
    return min(alpha.x, alpha.y) * distance(rect.center, p) > 0.35 * length(rect.half);
}

// Resposta do fechamento, para `v`, à luz de um retângulo de radiância uniforme `radiance` (W/(m²·sr), a do lado que
// emite), no ponto `p` de normal `n`: as mesmas camadas de `closure_eval`, com cada lobo integrado sobre o retângulo.
fn closure_area_eval(c: Closure, n: vec3f, v: vec3f, p: vec3f, rect: ClosureAreaRect, radiance: vec3f) -> vec3f {
    if (dot(p - rect.center, rect.normal) <= 0.0) { return vec3f(0.0); }
    let nb = closure_lobe_normal(c.normal, n, v);
    let nv = max(dot(nb, v), 1e-4);
    let nc = closure_lobe_normal(c.coat_normal, n, v);
    let has_base = closure_has(CLOSURE_SPECULAR) && c.dielectric_weight + c.conductor_weight > 0.0;
    let has_coat = closure_has(CLOSURE_COAT) && c.coat_weight > 0.0;
    let frame = closure_base_frame(c, nb);
    let rc = max(c.coat_roughness, BSDF_MIN_ROUGHNESS);
    let base_wide = closure_area_wide(rect, p, frame[2].xy);
    let coat_wide = closure_area_wide(rect, p, vec2f(rc * rc));

    // Os lobos largos: os de baixo, o sheen e os especulares largos diante do retângulo.
    var under = vec3f(0.0);
    var sheen = vec3f(0.0);
    var spec = vec3f(0.0);
    var coat = vec3f(0.0);
    let gauss = array<vec2f, 4>(vec2f(-0.8611363116, 0.3478548451), vec2f(-0.3399810436, 0.6521451549),
        vec2f(0.3399810436, 0.6521451549), vec2f(0.8611363116, 0.3478548451));
    let quarter = rect.half.x * rect.half.y;
    for (var i = 0u; i < 4u; i++) {
        for (var j = 0u; j < 4u; j++) {
            let piece = closure_area_piece(rect, p, vec2f(gauss[i].x, gauss[j].x) * rect.half,
                gauss[i].y * gauss[j].y * quarter);
            if (piece.omega <= 0.0) { continue; }
            under += closure_under_lobes(c, nb, v, piece.l) * piece.omega;
            sheen += closure_sheen_lobe(c, nb, v, piece.l) * piece.omega;
            if (has_base && base_wide) { spec += closure_base_lobe_in(c, frame, nb, v, piece.l) * piece.omega; }
            if (has_coat && coat_wide) { coat += vec3f(closure_coat_lobe(c, nc, v, piece.l)) * piece.omega; }
        }
    }

    // Os especulares estreitos diante do retângulo: a grade do lobo.
    if (has_base) {
        if (!base_wide) {
            let t = select(closure_default_tangent(nb), frame[0], frame[2].z > 0.0);
            spec = closure_area_lobe(c, rect, p, v, nb, t, frame[2].xy, frame, false);
        }
        spec *= closure_base_boost(c, nv);
    }
    if (has_coat) {
        if (!coat_wide) {
            coat = closure_area_lobe(c, rect, p, v, nc, closure_default_tangent(nc), vec2f(rc * rc), mat3x3f(), true);
        }
        coat *= closure_coat_boost(c, max(dot(nc, v), 1e-4));
    }

    let base = spec + closure_under_dielectric(c, nv) * under;
    return (sheen + closure_sheen_pass(c, nv) * (coat + closure_coat_pass(c, nv) * base)) * radiance;
}
