// Espalhamento da lente (spec 041; Jimenez 2014, "Next generation post processing in Call of Duty: Advanced Warfare"):
// a luz que a lente (vidro, superfícies, diafragma) espalha para longe da imagem de cada ponto — o clarão em volta do sol
// e das luzes fortes. Uma fração `G` (`params.p0.x`) da energia de cada pixel sai do núcleo e cai numa função de
// espalhamento de cauda longa ~ θ^(−p) (`params.p0.y`; p = 3: o termo de espalhamento de Spencer et al. 1995), feita da
// soma de desfoques de largura dobrando a cada nível de uma pirâmide de `BLOOM_LEVELS` níveis (o nível i com o peso
// `c^i`, `c = 2^(2 − p)`: a energia por oitava de raio de θ^(−p) em 2D). A imagem final é `(1 − G)·cor + G·(espalhada)`:
// a energia se conserva e não há limiar (toda a luz espalha; só a forte o bastante aparece sobre o resto).
// A pirâmide guarda a radiância × `BLOOM_SCALE`: com o excesso acima do teto da cor (`post_overflow_tex`, o disco do sol a
// ~10⁹ nits) a energia inteira cabe no meio-float.
// Descida: 13 leituras pesadas (a média se conserva); subida: a tenda 3 × 3 do nível de baixo somada ao nível de cima.
// Requer: effects_base, bloom_lo_tex, bloom_overflow.

const BLOOM_LEVELS: f32 = 7.0;
const BLOOM_SCALE: f32 = 1.0 / 32768.0;
/** O teto do meio-float. */
const BLOOM_MAX: f32 = 65504.0;

/** A razão de energia entre níveis vizinhos: `c = 2^(2 − p)`. */
fn bloom_ratio() -> f32 {
    return exp2(2.0 - params.p0.y);
}

/** A soma dos pesos dos níveis (`Σ c^i`, i < `BLOOM_LEVELS`). */
fn bloom_norm() -> f32 {
    let c = bloom_ratio();
    if (abs(1.0 - c) < 1e-4) { return BLOOM_LEVELS; }
    return (1.0 - pow(c, BLOOM_LEVELS)) / (1.0 - c);
}

/** As 13 leituras da descida em `uv` com o texel `t` da origem (pesos somando 1). */
fn bloom_down13(uv: vec2f, t: vec2f) -> vec3f {
    let a = textureSample(src_tex, src_smp, uv + t * vec2f(-2.0, -2.0)).rgb;
    let b = textureSample(src_tex, src_smp, uv + t * vec2f(0.0, -2.0)).rgb;
    let c = textureSample(src_tex, src_smp, uv + t * vec2f(2.0, -2.0)).rgb;
    let d = textureSample(src_tex, src_smp, uv + t * vec2f(-2.0, 0.0)).rgb;
    let e = textureSample(src_tex, src_smp, uv).rgb;
    let f = textureSample(src_tex, src_smp, uv + t * vec2f(2.0, 0.0)).rgb;
    let g = textureSample(src_tex, src_smp, uv + t * vec2f(-2.0, 2.0)).rgb;
    let h = textureSample(src_tex, src_smp, uv + t * vec2f(0.0, 2.0)).rgb;
    let i = textureSample(src_tex, src_smp, uv + t * vec2f(2.0, 2.0)).rgb;
    let j = textureSample(src_tex, src_smp, uv + t * vec2f(-1.0, -1.0)).rgb;
    let k = textureSample(src_tex, src_smp, uv + t * vec2f(1.0, -1.0)).rgb;
    let l = textureSample(src_tex, src_smp, uv + t * vec2f(-1.0, 1.0)).rgb;
    let m = textureSample(src_tex, src_smp, uv + t * vec2f(1.0, 1.0)).rgb;
    return (j + k + l + m) * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + e * 0.125;
}

/** As mesmas 13 leituras no excesso da radiância (radiância absoluta). */
fn bloom_down13_overflow(uv: vec2f, t: vec2f) -> vec3f {
    var sum = bloom_overflow(uv) * 0.125;
    sum += (bloom_overflow(uv + t * vec2f(-1.0, -1.0)) + bloom_overflow(uv + t * vec2f(1.0, -1.0))
        + bloom_overflow(uv + t * vec2f(-1.0, 1.0)) + bloom_overflow(uv + t * vec2f(1.0, 1.0))) * 0.125;
    sum += (bloom_overflow(uv + t * vec2f(-2.0, -2.0)) + bloom_overflow(uv + t * vec2f(2.0, -2.0))
        + bloom_overflow(uv + t * vec2f(-2.0, 2.0)) + bloom_overflow(uv + t * vec2f(2.0, 2.0))) * 0.03125;
    sum += (bloom_overflow(uv + t * vec2f(0.0, -2.0)) + bloom_overflow(uv + t * vec2f(-2.0, 0.0))
        + bloom_overflow(uv + t * vec2f(2.0, 0.0)) + bloom_overflow(uv + t * vec2f(0.0, 2.0))) * 0.0625;
    return sum;
}

/** A tenda 3 × 3 do nível de baixo em `uv` (pesos 1 2 1 / 16). */
fn bloom_tent(uv: vec2f) -> vec3f {
    let t = 1.0 / vec2f(textureDimensions(bloom_lo_tex, 0));
    var sum = textureSample(bloom_lo_tex, src_smp, uv).rgb * 4.0;
    sum += (textureSample(bloom_lo_tex, src_smp, uv + vec2f(t.x, 0.0)).rgb
        + textureSample(bloom_lo_tex, src_smp, uv - vec2f(t.x, 0.0)).rgb
        + textureSample(bloom_lo_tex, src_smp, uv + vec2f(0.0, t.y)).rgb
        + textureSample(bloom_lo_tex, src_smp, uv - vec2f(0.0, t.y)).rgb) * 2.0;
    sum += textureSample(bloom_lo_tex, src_smp, uv + t).rgb
        + textureSample(bloom_lo_tex, src_smp, uv - t).rgb
        + textureSample(bloom_lo_tex, src_smp, uv + vec2f(t.x, -t.y)).rgb
        + textureSample(bloom_lo_tex, src_smp, uv + vec2f(-t.x, t.y)).rgb;
    return sum / 16.0;
}

/** O primeiro nível: a cor da cena mais o excesso acima do teto dela, na escala da pirâmide. */
@fragment
fn fs_bloom_down_first(in: VsOut) -> @location(0) vec4f {
    let t = 1.0 / vec2f(textureDimensions(src_tex, 0));
    let v = bloom_down13(in.uv, t) + bloom_down13_overflow(in.uv, t);
    return vec4f(min(v * BLOOM_SCALE, vec3f(BLOOM_MAX)), 1.0);
}

/** Os níveis seguintes. */
@fragment
fn fs_bloom_down(in: VsOut) -> @location(0) vec4f {
    let t = 1.0 / vec2f(textureDimensions(src_tex, 0));
    return vec4f(bloom_down13(in.uv, t), 1.0);
}

/** A subida: o nível (da descida) mais `c` × o de baixo já somado. */
@fragment
fn fs_bloom_up(in: VsOut) -> @location(0) vec4f {
    let here = textureSample(src_tex, src_smp, in.uv).rgb;
    return vec4f(min(here + bloom_ratio() * bloom_tent(in.uv), vec3f(BLOOM_MAX)), 1.0);
}

/** A imagem: o núcleo `(1 − G)·cor` mais a fração espalhada, normalizada pela soma dos pesos. */
@fragment
fn fs_bloom(in: VsOut) -> @location(0) vec4f {
    let g = clamp(params.p0.x, 0.0, 1.0);
    let c = textureSample(src_tex, src_smp, in.uv).rgb;
    let spread = bloom_tent(in.uv) / (bloom_norm() * BLOOM_SCALE);
    return vec4f(min(c * (1.0 - g) + spread * g, vec3f(BLOOM_MAX)), 1.0);
}
