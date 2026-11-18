// Mapa de profundidade ótica visto do sol (spec 041, R11): por texel da projeção ortográfica do sol centrada na câmera
// — coordenadas do plano do sol deformadas por `x = x0·sinh(2a·k)` (`clouds.sunWarp`: texels finos perto da câmera,
// crescendo com a distância como o pixel dela, até as nuvens do horizonte; em cima, com o sol baixo, a casca é uma faixa
// estreita do plano e a escala segue a altitude) —, o raio que desce do sol atravessa o primeiro trecho da casca; o
// texel guarda a profundidade ótica acumulada ao fim de cada um dos `CLOUD_SHADOW_KNOTS` trechos iguais (as camadas
// z = 0…3 do volume, quatro nós por camada) — os nós são da geometria (a casca), recalculados na leitura. Com o sol a
// 4°, o trecho tem ~35 km: quatro nós lineares (o desenho anterior) erravam τ em dezenas (medido no smoke `clouds`,
// `sunset`). O mapa inteiro a cada quadro: quem recebe a luz do sol lê o do quadro.
//
// A origem de cada coluna é a saída do topo da casca do lado do sol (`cloud_sun_entry`), com o sol acima ou abaixo do
// horizonte: as nuvens altas seguem iluminadas depois do pôr do sol (com o sol abaixo do horizonte o mapa ficava vazio
// — τ = 0 —, e as nuvens e o chão que as vê acendiam num quadro, medido no `solposto` a −0,03°).
//
// As amostras são um pente fixo no mundo: nos planos perpendiculares ao sol a `m·Δ + φ` do plano do mapa (que passa
// pela origem do mundo; `φ` um deslocamento por coluna, fixo na linha do mundo — as colunas vizinhas, que a leitura
// filtra, erram em nuvens diferentes, e o erro da amostragem cai na média em vez de se repetir em todas), cada uma pelo meio da sua célula `[mΔ − Δ/2, mΔ + Δ/2]` recortada ao trecho. Com as amostras em
// frações do trecho (o desenho anterior), o pente escorregava pela nuvem quando o sol baixo mudava o comprimento do trecho
// (`Δ` comprimento ≈ comprimento·cot(e)·Δe: um passo inteiro a cada 0,06° a 4,4°) e τ do chão oscilava 125 ↔ 167 níveis
// de 8 bits nesse período — no vídeo acelerado, piscando quadro a quadro. `Δ = CLOUD_SHADOW_SPACING·2ⁿ`, o menor com no
// máximo `CLOUD_SHADOW_STEPS` amostras no trecho; o pente de `2Δ` (as amostras pares, células de `2Δ`) é o do nível
// seguinte, e o resultado mistura os dois pela posição do comprimento na oitava — contínuo no ângulo do sol.
// Teto constante: `CLOUD_SHADOW_STEPS + 4` amostras (mais duas leituras nas pontas do pente par) e, no total da
// coluna, 2 × `CLOUD_SHADOW_KNOTS` nós gravados.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, cloud_common, cloud_density, clouds, cloud_shadow_out.

/** Teto de amostras do pente fino no trecho (o grosso, as pares, tem metade). */
const CLOUD_SHADOW_STEPS: u32 = 192u;
const CLOUD_SHADOW_KNOTS: u32 = 16u;
/** O espaçamento (m) do pente no nível 0: os níveis são `CLOUD_SHADOW_SPACING·2ⁿ`. */
const CLOUD_SHADOW_SPACING: f32 = 1.0;
/** O nível mais fino do pente: `2⁶` m, perto do texel do volume de detalhe (1800 m / 32). */
const CLOUD_SHADOW_MIN_LEVEL: f32 = 6.0;

/** Alcance (m) do deslocamento do pente por coluna. */
const CLOUD_SHADOW_SHIFT: f32 = 65536.0;

/** Hash inteiro (Wang/PCG) da coluna no reticulado do mundo. */
fn cloud_shadow_hash(v: vec2i) -> u32 {
    var x = (bitcast<u32>(v.x) * 0x8da6b343u) ^ (bitcast<u32>(v.y) * 0xd8163841u);
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

/** A extinção (1/m) no ponto a `s` m do plano do mapa na coluna de `o0`. */
fn cloud_shadow_extinction(o0: vec3f, sun: vec3f, s: f32) -> f32 {
    return cloud_density(o0 + sun * s, true) * clouds.layer.z;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_shadow_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_shadow_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec2u(i % size.x, i / size.x);
    let a = (vec2f(g) + 0.5) / vec2f(size.xy) - 0.5;
    let w = clouds.sunWarp;
    let uv = vec2f(w.x * sinh(2.0 * a.x * w.y), w.z * sinh(2.0 * a.y * w.w));
    let sun = clouds.sunDir.xyz;
    let o0 = clouds.sunFrame.xyz + clouds.sunRight.xyz * uv.x + clouds.sunUp.xyz * uv.y;
    let entry = cloud_sun_entry(o0, sun);
    let segs = cloud_shell_segments(o0 + sun * entry, -sun, 1e9);
    var fine: array<f32, CLOUD_SHADOW_KNOTS>;
    var coarse: array<f32, CLOUD_SHADOW_KNOTS>;
    var blend = 0.0;
    if (segs.y > segs.x) {
        // O trecho em distância ao plano do mapa: de `hi` (a entrada, do lado do sol) a `lo`.
        let hi = entry - segs.x;
        let lo = entry - segs.y;
        let len = hi - lo;
        // O nível pelo teto de amostras, nunca abaixo de `CLOUD_SHADOW_MIN_LEVEL` (com o sol alto o trecho é curto e o
        // pente mais fino que o texel do volume de detalhe só custaria).
        let x = max(log2(len / (f32(CLOUD_SHADOW_STEPS) * CLOUD_SHADOW_SPACING)), CLOUD_SHADOW_MIN_LEVEL - 1.0);
        let n = max(ceil(x), CLOUD_SHADOW_MIN_LEVEL);
        blend = x - (n - 1.0);
        let dl = CLOUD_SHADOW_SPACING * exp2(n);
        let knot_len = len / f32(CLOUD_SHADOW_KNOTS);
        // O deslocamento do pente desta coluna (fixo na linha do mundo: o índice do texel mais o encaixe do centro), o
        // mesmo em todos os níveis (o pente par continua o do nível seguinte).
        let line = vec2i(g) + vec2i(i32(clouds.sunRight.w), i32(clouds.sunUp.w));
        let phi = f32(cloud_shadow_hash(line) & 0xffffu) / 65536.0 * CLOUD_SHADOW_SHIFT;
        // A primeira amostra cuja célula do pente par pode tocar o trecho: `mΔ + φ − Δ < hi`.
        let m0 = i32(floor((hi - phi) / dl)) + 1;
        var sum_f = 0.0;
        var sum_c = 0.0;
        var kf = 0u;
        var kc = 0u;
        for (var i = 0u; i < CLOUD_SHADOW_STEPS + 4u; i++) {
            let m = m0 - i32(i);
            let s = f32(m) * dl + phi;
            if (s + dl <= lo) { break; }
            var rf = 0.0;
            let fa = max(s - 0.5 * dl, lo);
            let fb = min(s + 0.5 * dl, hi);
            if (fb > fa) {
                rf = cloud_shadow_extinction(o0, sun, 0.5 * (fa + fb));
                for (var r = 0u; r < CLOUD_SHADOW_KNOTS; r++) {
                    if (kf >= CLOUD_SHADOW_KNOTS) { break; }
                    let at = hi - f32(kf + 1u) * knot_len;
                    if (at < fa) { break; }
                    fine[kf] = sum_f + rf * (fb - at);
                    kf++;
                }
                sum_f += rf * (fb - fa);
            }
            if ((m & 1) == 0) {
                let ca = max(s - dl, lo);
                let cb = min(s + dl, hi);
                if (cb > ca) {
                    // No meio do trecho a célula par inteira tem a amostra da fina no centro; nas pontas, a do meio dela.
                    var rc = rf;
                    if (ca > s - dl || cb < s + dl) { rc = cloud_shadow_extinction(o0, sun, 0.5 * (ca + cb)); }
                    for (var r = 0u; r < CLOUD_SHADOW_KNOTS; r++) {
                        if (kc >= CLOUD_SHADOW_KNOTS) { break; }
                        let at = hi - f32(kc + 1u) * knot_len;
                        if (at < ca) { break; }
                        coarse[kc] = sum_c + rc * (cb - at);
                        kc++;
                    }
                    sum_c += rc * (cb - ca);
                }
            }
        }
        for (var k = 0u; k < CLOUD_SHADOW_KNOTS; k++) {
            if (k >= kf) { fine[k] = sum_f; }
            if (k >= kc) { coarse[k] = sum_c; }
        }
    }
    for (var l = 0u; l < CLOUD_SHADOW_KNOTS / 4u; l++) {
        let vf = vec4f(fine[l * 4u], fine[l * 4u + 1u], fine[l * 4u + 2u], fine[l * 4u + 3u]);
        let vc = vec4f(coarse[l * 4u], coarse[l * 4u + 1u], coarse[l * 4u + 2u], coarse[l * 4u + 3u]);
        textureStore(cloud_shadow_out, vec3u(g, l), mix(vf, vc, blend));
    }
}
