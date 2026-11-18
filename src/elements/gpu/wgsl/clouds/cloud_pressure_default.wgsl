// O campo de pressão padrão das nuvens (spec 041, R19): sistemas de alta e baixa em escala sinótica num reticulado de
// células de lado `clouds.weatherPattern.x` (m), no máximo um por célula, no referencial que anda com o vento de condução.
// Cada sistema é o núcleo de suporte compacto `A·(1 − d²/R²)³` (C²: o laplaciano, que dá a subida, é contínuo) com o
// centro sorteado no miolo da célula — a soma das 3 × 3 células vizinhas é exata (o raio é no máximo um lado). A vida:
// a geração `floor(t/T + φ)` sorteia o centro, o tipo (baixa ou alta) e a força; o envelope `sin²(π·idade)` nasce de
// zero, cresce e se desfaz — a troca de geração acontece com o sistema extinto (sem salto). As baixas têm raio 0,75 do
// lado e a amplitude `weatherPattern.y`; as altas, raio 1 e no máximo o teto `weatherPattern.z` do equilíbrio regular do
// vento gradiente (largas e de gradiente fraco, como na atmosfera). Espelho de `defaultPressure` em
// `reference/cloudWeather.ts`.
// Requer: constants, clouds, random.

const CLOUD_PATTERN_LOW_RADIUS: f32 = 0.75;
const CLOUD_PATTERN_HIGH_RADIUS: f32 = 1.0;
const CLOUD_PATTERN_LOW_FRACTION: f32 = 0.5;

/** O núcleo `(1 − s)³`, s = d²/R², zero fora do raio. */
fn cloud_pattern_bump(d2: f32, radius: f32) -> f32 {
    let s = d2 / (radius * radius);
    if (s >= 1.0) { return 0.0; }
    let k = 1.0 - s;
    return k * k * k;
}

/** A anomalia de pressão (Pa) em `xz` (m, referencial do vento de condução) no tempo simulado `time` (s). */
fn cloud_pressure_default(xz: vec2f, time: f32) -> f32 {
    let pat = clouds.weatherPattern;
    let seed = clouds.weatherFlags.w;
    let cell = vec2i(floor(xz / pat.x));
    var sum = 0.0;
    for (var k = 0u; k < 9u; k++) {
        let c = bitcast<vec2u>(cell + vec2i(i32(k % 3u) - 1, i32(k / 3u) - 1));
        let phase = random_unit(hash3(vec3u(c, seed)));
        let s = time / pat.w + phase;
        let gen = floor(s);
        let age = s - gen;
        let g = pcg_hash(seed ^ u32(gen)) ^ 0x51ed27u;
        let h = hash3(vec3u(c, g));
        let u = vec2f(random_unit(pcg_hash(h ^ 1u)), random_unit(pcg_hash(h ^ 2u)));
        let low = random_unit(pcg_hash(h ^ 3u)) < CLOUD_PATTERN_LOW_FRACTION;
        let force = 0.6 + 0.4 * random_unit(pcg_hash(h ^ 4u));
        let envelope = sin(PI * age);
        let a = select(min(pat.y, pat.z), -pat.y, low) * force * envelope * envelope;
        let radius = select(CLOUD_PATTERN_HIGH_RADIUS, CLOUD_PATTERN_LOW_RADIUS, low) * pat.x;
        let center = (vec2f(bitcast<vec2i>(c)) + 0.15 + 0.7 * u) * pat.x;
        let d = xz - center;
        sum += a * cloud_pattern_bump(dot(d, d), radius);
    }
    return sum;
}
