// Volumes dos meios participantes (spec 033, R12) no buffer dos meios (`fog_media`, vec4f): o cabeçalho (a contagem em
// x) e 8 vec4f por volume — forma (forma, tipo da densidade, índice da função, 0), centro (w = borda suave), meias-medidas
// (ou o raio em x), ótica (extinção, anisotropia), albedo (a = vivo), emissão, medidas da grade e (slot do registro da
// função, primeiro valor da grade) — seguidos dos valores das grades (4 por vec4f). A densidade é a extinção (1/m) no
// ponto: a da forma com a borda suave, × a relativa da função (`fog_density_at`) ou da grade (trilinear na caixa).
// Requer: froxels (o tempo), fog_media, MEDIA_MARCH_STEPS, fog_density_at.

const FOG_RECORD_VEC4: u32 = 8u;
const FOG_SHAPE_BOX: u32 = 0u;
const FOG_DENSITY_CONSTANT: u32 = 0u;
const FOG_DENSITY_FUNCTION: u32 = 1u;
const FOG_DENSITY_GRID: u32 = 2u;

struct FogRecord {
    shape: vec4u,
    center: vec4f,
    extent: vec4f,
    optics: vec4f,
    albedo: vec4f,
    emission: vec4f,
    grid: vec4u,
    refs: vec4u,
}

fn fog_count() -> u32 {
    return min(bitcast<u32>(fog_media[0].x), (arrayLength(&fog_media) - 1u) / FOG_RECORD_VEC4);
}

fn fog_record(k: u32) -> FogRecord {
    let b = 1u + k * FOG_RECORD_VEC4;
    return FogRecord(bitcast<vec4u>(fog_media[b]), fog_media[b + 1u], fog_media[b + 2u], fog_media[b + 3u],
        fog_media[b + 4u], fog_media[b + 5u], bitcast<vec4u>(fog_media[b + 6u]), bitcast<vec4u>(fog_media[b + 7u]));
}

/** Quanto o ponto está dentro da forma (m; negativo fora). */
fn fog_inside(v: FogRecord, p: vec3f) -> f32 {
    let q = p - v.center.xyz;
    if (v.shape.x == FOG_SHAPE_BOX) {
        let d = v.extent.xyz - abs(q);
        return min(d.x, min(d.y, d.z));
    }
    return v.extent.x - length(q);
}

/** Máscara da forma em [0, 1]: 1 dentro, a borda suave até a superfície. */
fn fog_mask(v: FogRecord, p: vec3f) -> f32 {
    let inside = fog_inside(v, p);
    if (inside <= 0.0) { return 0.0; }
    if (v.center.w <= 0.0) { return 1.0; }
    return smoothstep(0.0, v.center.w, inside);
}

/** Valor da grade (trilinear) na caixa que contém o volume. */
fn fog_grid_value(v: FogRecord, p: vec3f) -> f32 {
    let n = v.grid.xyz;
    let u = clamp((p - v.center.xyz) / (2.0 * v.extent.xyz) + 0.5, vec3f(0.0), vec3f(1.0)) * vec3f(n - 1u);
    let i = min(vec3u(floor(u)), n - 2u);
    let f = u - vec3f(i);
    var sum = 0.0;
    for (var k = 0u; k < 8u; k++) {
        let o = vec3u(k & 1u, (k >> 1u) & 1u, k >> 2u);
        let c = i + o;
        let g = v.refs.y + c.x + n.x * (c.y + n.y * c.z);
        let w = mix(vec3f(1.0) - f, f, vec3f(o));
        sum += fog_media[g >> 2u][g & 3u] * w.x * w.y * w.z;
    }
    return max(sum, 0.0);
}

/** Extinção (1/m) do volume no ponto. */
fn fog_density(v: FogRecord, p: vec3f) -> f32 {
    let m = fog_mask(v, p);
    if (m <= 0.0) { return 0.0; }
    var k = 1.0;
    if (v.shape.y == FOG_DENSITY_FUNCTION) {
        k = fog_density_at(v.shape.z, p, froxels.frame.w, v.refs.x);
        if (!(k > 0.0)) { k = 0.0; }
    } else if (v.shape.y == FOG_DENSITY_GRID) {
        k = fog_grid_value(v, p);
    }
    return m * k * v.optics.x;
}

/** Trecho [t0, t1) do raio (direção unitária) dentro da forma, limitado a [0, t_max]; vazio com t0 ≥ t1. */
fn fog_span(v: FogRecord, o: vec3f, d: vec3f, t_max: f32) -> vec2f {
    let q = o - v.center.xyz;
    if (v.shape.x == FOG_SHAPE_BOX) {
        let inv = 1.0 / d;
        let a = (-v.extent.xyz - q) * inv;
        let b = (v.extent.xyz - q) * inv;
        let lo = min(a, b);
        let hi = max(a, b);
        return vec2f(max(max(lo.x, lo.y), max(lo.z, 0.0)), min(min(hi.x, hi.y), min(hi.z, t_max)));
    }
    let r = v.extent.x;
    let bq = dot(q, d);
    let disc = bq * bq - (dot(q, q) - r * r);
    if (disc <= 0.0) { return vec2f(1.0, 0.0); }
    let s = sqrt(disc);
    return vec2f(max(-bq - s, 0.0), min(-bq + s, t_max));
}

/** Transmitância do volume no segmento [0, t_max] do raio: exata no meio homogêneo de borda nítida, senão por marcha. */
fn fog_volume_transmittance(v: FogRecord, o: vec3f, d: vec3f, t_max: f32) -> f32 {
    let s = fog_span(v, o, d, t_max);
    if (s.x >= s.y) { return 1.0; }
    if (v.shape.y == FOG_DENSITY_CONSTANT && v.center.w <= 0.0) { return exp(-v.optics.x * (s.y - s.x)); }
    let dt = (s.y - s.x) / f32(MEDIA_MARCH_STEPS);
    var depth = 0.0;
    for (var i = 0u; i < MEDIA_MARCH_STEPS; i++) {
        depth += fog_density(v, o + d * (s.x + (f32(i) + 0.5) * dt));
    }
    return exp(-depth * dt);
}

/** Transmitância de todos os volumes no segmento [0, t_max] do raio. */
fn fog_transmittance(o: vec3f, d: vec3f, t_max: f32) -> f32 {
    var t = 1.0;
    let count = fog_count();
    for (var k = 0u; k < count; k++) {
        let v = fog_record(k);
        if (v.albedo.a < 0.5) { continue; }
        t *= fog_volume_transmittance(v, o, d, t_max);
    }
    return t;
}
