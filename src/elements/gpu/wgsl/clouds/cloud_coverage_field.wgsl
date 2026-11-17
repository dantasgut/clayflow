// A cobertura local padrão (spec 041, R4): sem função de cobertura, a cobertura pedida é a fração do céu coberta. Um fBm
// de gradiente 2D (3 oitavas, células de 8 km) levado a distribuição uniforme `u` pela função normal acumulada
// aproximada (`1/(1 + e^(−1,702·x/σ))`, σ = 0,2014 medido na referência u32) varia a cobertura local em grande escala:
// `L = g(c, tipo) + 0,4·(u − 0,5)`, e `g` é a inversa da área coberta medida na referência f64 com os volumes completos
// (a fração das colunas com transmitância < 0,5; tabelas do cúmulo e do estrato, `cloud_coverage_calibration` em
// research.md, R4). Com `c = 0`, nada; com `c = 1`, `L ≥ 1` em todo ponto (sem buracos). Espelho de `coverageField` em
// `cloudModel.ts`. O tipo local (`cloud_type_field`) varia em volta do tipo pedido.
// Requer: node_noise.

const CLOUD_COVERAGE_SCALE: f32 = 1.0 / 8000.0;
const CLOUD_COVERAGE_SIGMA: f32 = 0.2014;
const CLOUD_COVERAGE_SPREAD: f32 = 0.4;
const CLOUD_TYPE_SCALE: f32 = 1.0 / 3000.0;
const CLOUD_TYPE_SPREAD: f32 = 0.8;

/** Área coberta medida em g = 0, 0,1, …, 0,7 (cúmulo e estrato). */
const CLOUD_AREA_CUMULUS = array<f32, 8>(0.0, 0.016, 0.142, 0.370, 0.604, 0.834, 0.975, 0.999);
const CLOUD_AREA_STRATUS = array<f32, 8>(0.0, 0.004, 0.063, 0.242, 0.476, 0.720, 0.914, 0.989);

/** A inversa da área coberta numa tabela: g para a fração `c`. */
fn cloud_coverage_inverse(c: f32, stratus: bool) -> f32 {
    if (c <= 0.0) { return -1.0; }
    if (c >= 1.0) { return 1.2; }
    var g = 0.7 + (c - 0.999) / 0.001 * 0.5;
    for (var k = 1u; k < 8u; k++) {
        let a0 = select(CLOUD_AREA_CUMULUS[k - 1u], CLOUD_AREA_STRATUS[k - 1u], stratus);
        let a1 = select(CLOUD_AREA_CUMULUS[k], CLOUD_AREA_STRATUS[k], stratus);
        if (c <= a1) {
            g = (f32(k) - 1.0 + (c - a0) / max(a1 - a0, 1e-6)) * 0.1;
            break;
        }
    }
    return g;
}

/** A cobertura local em `xz` (m, referencial do vento) para a cobertura pedida `c` e o tipo `t`. */
fn cloud_coverage_field(xz: vec2f, c: f32, t: f32) -> f32 {
    let q = xz * CLOUD_COVERAGE_SCALE;
    var s = 0.0;
    var a = 1.0;
    var n = 0.0;
    var f = 1.0;
    for (var k = 0u; k < 3u; k++) {
        s += a * node_noise_gradient2(q * f, 0.0, 1.0, vec2f(0.0), k, 0u);
        n += a;
        a *= 0.5;
        f *= 2.0;
    }
    let u = 1.0 / (1.0 + exp(-1.702 * (s / n) / CLOUD_COVERAGE_SIGMA));
    let k = clamp(t * 2.0, 0.0, 1.0);
    let g = mix(cloud_coverage_inverse(c, true), cloud_coverage_inverse(c, false), k);
    return clamp(g + CLOUD_COVERAGE_SPREAD * (u - 0.5), 0.0, 1.0);
}

/**
 * O tipo local em `xz` (m, referencial do vento) para o tipo pedido `t`: `t + 0,8·(u₂ − 0,5)`, `u₂` o campo uniforme de 2
 * oitavas de gradiente com células de 3 km e sementes próprias — uma nuvem sobe mais que a outra (com o tipo igual em
 * todo ponto, o topo de todas ficava na curva de nível do perfil: 10–90 % dos topos em 413 m; com o campo, 1,1 km).
 * Espelho de `typeField` em `cloudModel.ts`.
 */
fn cloud_type_field(xz: vec2f, t: f32) -> f32 {
    let q = xz * CLOUD_TYPE_SCALE;
    var s = 0.0;
    var a = 1.0;
    var n = 0.0;
    var f = 1.0;
    for (var k = 0u; k < 2u; k++) {
        s += a * node_noise_gradient2(q * f, 0.0, 1.0, vec2f(0.0), k + 3u, 0u);
        n += a;
        a *= 0.5;
        f *= 2.0;
    }
    let u = 1.0 / (1.0 + exp(-1.702 * (s / n) / CLOUD_COVERAGE_SIGMA));
    return clamp(t + CLOUD_TYPE_SPREAD * (u - 0.5), 0.0, 1.0);
}
