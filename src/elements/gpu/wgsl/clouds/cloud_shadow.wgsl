// Mapa de profundidade ótica visto do sol por páginas (spec 041, R11 revisto, T029): as colunas de uma página, a escolha
// das páginas do quadro (`cloud_shadow_select_main`) e, num passe só, o desenho das escolhidas e as colunas de prova das
// demais (`cloud_shadow_main`).
//
// Uma coluna é o raio que desce do sol pelo centro de um texel do plano do mapa (`cloud_shadow_pages`) e atravessa o
// primeiro trecho da casca: o texel guarda a profundidade ótica acumulada ao fim de cada um dos `CLOUD_SHADOW_KNOTS`
// trechos iguais (as camadas z = 0…3 do volume, quatro nós por camada) — os nós são da geometria (a casca), recalculados
// na leitura. A origem da coluna é a saída do topo da casca do lado do sol (`cloud_sun_entry`), com o sol acima ou
// abaixo do horizonte (as nuvens altas seguem iluminadas depois do pôr do sol).
//
// As amostras são um pente fixo no referencial das nuvens: nos planos perpendiculares ao sol a `m·Δ + φ` do plano do mapa
// (que anda com o vento; `φ` um deslocamento por coluna, fixo no texel global — as colunas vizinhas, que a leitura
// filtra, erram em nuvens diferentes, e o erro da amostragem cai na média em vez de se repetir em todas), cada uma pelo
// meio da sua célula `[mΔ − Δ/2, mΔ + Δ/2]` recortada ao trecho. `Δ = CLOUD_SHADOW_SPACING·2ⁿ`, o menor com no máximo
// `CLOUD_SHADOW_STEPS` amostras no trecho; o pente de `2Δ` (as amostras pares) é o do nível seguinte, e o resultado
// mistura os dois pela posição do comprimento na oitava — contínuo no ângulo do sol (o pente em frações do trecho
// escorregava pela nuvem com o sol baixo, e o chão piscava no vídeo acelerado).
// Teto constante por coluna: `CLOUD_SHADOW_STEPS + 4` amostras e 2 × `CLOUD_SHADOW_KNOTS` nós gravados; o desenho faz até
// 2 colunas por invocação (289 texels, 256 invocações), a prova 1.
//
// Um grupo por página física. A escolhida no quadro é desenhada: os texels e o registro dela — o sol, o tempo e o quadro
// do desenho, a página global, a assinatura do conteúdo e a célula do pivô, as medidas (o maior |ΔT| entre texels
// vizinhos por metro, nos nós 4, 8, 12 e 16, com a coluna da vizinha; o maior |ΔT| entre nós seguidos por metro ao longo
// da coluna; o maior comprimento do trecho; a maior distância das pontas do trecho ao plano; o comprimento do trecho no
// centro da página) e os nós 4, 8, 12 e 16 de cada texel (o que as provas comparam) — e o carimbo da série do atlas (a
// época atual). Nas demais, `CLOUD_SHADOW_PROBES` colunas de prova (texels embaralhados por quadro) refeitas e
// comparadas com o registro: a maior diferença de T fica no registro até a página ser refeita — a mudança medida, que a
// escolha do quadro seguinte lê. A prova junto do desenho tem a latência de uma coluna, sem um passe a mais na cadeia.
// Requer: WORKGROUP_SIZE, cloud_common, cloud_density, cloud_shadow_pages, clouds, cameras, page_alloc, cloud_wind_at,
// cloud_shadow_out, cloud_shadow_pages_meta, cloud_shadow_work, cloud_shadow_stamps, cloud_shadow_clock.

/** Teto de amostras do pente fino no trecho (o grosso, as pares, tem metade). */
const CLOUD_SHADOW_STEPS: u32 = 192u;
const CLOUD_SHADOW_KNOTS: u32 = 16u;
/** O espaçamento (m) do pente no nível 0: os níveis são `CLOUD_SHADOW_SPACING·2ⁿ`. */
const CLOUD_SHADOW_SPACING: f32 = 1.0;
/** O nível mais fino do pente: `2⁶` m, perto do texel do volume de detalhe (1800 m / 32). */
const CLOUD_SHADOW_MIN_LEVEL: f32 = 6.0;
/** Alcance (m) do deslocamento do pente por coluna. */
const CLOUD_SHADOW_SHIFT: f32 = 65536.0;
/** Invocações do grupo do desenho de uma página. */
const CLOUD_SHADOW_PAGE_GROUP: u32 = 256u;

/** Hash inteiro (Wang/PCG) da coluna no reticulado do texel global. */
fn cloud_shadow_hash(v: vec2i) -> u32 {
    return cloud_shadow_hash1((bitcast<u32>(v.x) * 0x8da6b343u) ^ (bitcast<u32>(v.y) * 0xd8163841u));
}

/** A extinção (1/m) no ponto a `s` m do plano do mapa na coluna de `o0`. */
fn cloud_shadow_extinction(o0: vec3f, sun: vec3f, s: f32) -> f32 {
    return cloud_density(o0 + sun * s, true) * clouds.layer.z;
}

/** Uma coluna: τ ao fim dos 16 nós, o comprimento do trecho e a maior distância das pontas dele ao plano. */
struct CloudShadowColumn {
    knots: array<f32, 16>,
    len: f32,
    lever: f32,
}

/**
 * A coluna do texel de coordenadas `x` (m) no plano do sol `sun` (a base `basis`), `line` o texel global (com o nível)
 * que fixa o deslocamento do pente.
 */
fn cloud_shadow_column_knots(x: vec2f, line: vec2i, sun: vec3f, basis: mat2x3f) -> CloudShadowColumn {
    var out: CloudShadowColumn;
    let o0 = clouds.sunFrame.xyz + basis[0] * x.x + basis[1] * x.y;
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
        out.len = len;
        out.lever = max(abs(hi), abs(lo));
        // O nível pelo teto de amostras, nunca abaixo de `CLOUD_SHADOW_MIN_LEVEL` (com o sol alto o trecho é curto e o
        // pente mais fino que o texel do volume de detalhe só custaria).
        let lv = max(log2(len / (f32(CLOUD_SHADOW_STEPS) * CLOUD_SHADOW_SPACING)), CLOUD_SHADOW_MIN_LEVEL - 1.0);
        let n = max(ceil(lv), CLOUD_SHADOW_MIN_LEVEL);
        blend = lv - (n - 1.0);
        let dl = CLOUD_SHADOW_SPACING * exp2(n);
        let knot_len = len / f32(CLOUD_SHADOW_KNOTS);
        // O deslocamento do pente desta coluna (fixo no texel global), o mesmo em todos os níveis (o pente par continua o
        // do nível seguinte).
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
    for (var k = 0u; k < CLOUD_SHADOW_KNOTS; k++) { out.knots[k] = mix(fine[k], coarse[k], blend); }
    return out;
}

/** O texel global (com o nível no deslocamento) do texel `t` (0…16 por eixo) da página `g` do nível `k`. */
fn cloud_shadow_line(k: u32, g: vec2i, t: vec2u) -> vec2i {
    return g * i32(CLOUD_SHADOW_PAGE) + vec2i(t) + vec2i(i32(k) * 1000003, i32(k) * 7919);
}

/** O comprimento do trecho da casca na coluna do ponto `x` do plano (m; 0 sem casca). */
fn cloud_shadow_segment_length(x: vec2f) -> f32 {
    let sun = clouds.sunDir.xyz;
    let o0 = cloud_shadow_plane_point(x);
    let entry = cloud_sun_entry(o0, sun);
    let segs = cloud_shell_segments(o0 + sun * entry, -sun, 1e9);
    return max(segs.y - segs.x, 0.0);
}

/** A palavra `w` do registro da página física `slot`. */
fn cloud_shadow_meta_index(slot: u32, w: u32) -> u32 {
    return slot * CLOUD_SHADOW_RECORD_WORDS + w;
}

fn cloud_shadow_meta_f(slot: u32, w: u32) -> f32 {
    return bitcast<f32>(atomicLoad(&cloud_shadow_pages_meta[cloud_shadow_meta_index(slot, w)]));
}

fn cloud_shadow_meta_set_f(slot: u32, w: u32, v: f32) {
    atomicStore(&cloud_shadow_pages_meta[cloud_shadow_meta_index(slot, w)], bitcast<u32>(v));
}

fn cloud_shadow_meta_u(slot: u32, w: u32) -> u32 {
    return atomicLoad(&cloud_shadow_pages_meta[cloud_shadow_meta_index(slot, w)]);
}

fn cloud_shadow_meta_set_u(slot: u32, w: u32, v: u32) {
    atomicStore(&cloud_shadow_pages_meta[cloud_shadow_meta_index(slot, w)], v);
}

/**
 * O registro da página física `slot` vale para a página que a janela do quadro põe nela: carimbada na época da série, a
 * mesma página global, a mesma assinatura do conteúdo e a mesma célula do pivô.
 */
fn cloud_shadow_meta_current(slot: u32) -> bool {
    let g = cloud_shadow_slot_page(slot);
    return cloud_shadow_stamps[slot] == cloud_shadow_clock.x
        && bitcast<i32>(cloud_shadow_meta_u(slot, 4u)) == g.x
        && bitcast<i32>(cloud_shadow_meta_u(slot, 5u)) == g.y
        && cloud_shadow_meta_u(slot, 7u) == clouds.sunPages.y
        && cloud_shadow_meta_u(slot, 14u) == clouds.sunPages.z
        && cloud_shadow_meta_u(slot, 15u) == clouds.sunPages.w;
}

var<workgroup> cloud_shadow_wg_tau: array<f32, 1156>;
var<workgroup> cloud_shadow_wg_max: array<atomic<u32>, 4>;
var<workgroup> cloud_shadow_wg_chosen: u32;

/** A palavra do nó `l` (0…3: os nós 4, 8, 12 e 16) do texel `t` no registro da página física `slot`. */
fn cloud_shadow_summary_index(slot: u32, t: u32, l: u32) -> u32 {
    return cloud_shadow_meta_index(slot, CLOUD_SHADOW_META_WORDS + t * 4u + l);
}

/** O desenho da página física `slot` (as 256 invocações do grupo). */
fn cloud_shadow_draw(slot: u32, lid: u32) {
    let k = cloud_shadow_slot_level(slot);
    let g = cloud_shadow_slot_page(slot);
    let origin = cloud_shadow_slot_origin(slot);
    let texel = cloud_shadow_texel_size(k);
    for (var r = 0u; r < 2u; r++) {
        let t = lid + r * CLOUD_SHADOW_PAGE_GROUP;
        if (t >= CLOUD_SHADOW_PAGE_TEXELS) { break; }
        let tt = vec2u(t % CLOUD_SHADOW_STRIDE, t / CLOUD_SHADOW_STRIDE);
        let col = cloud_shadow_column_knots(
            cloud_shadow_texel_plane(k, g, tt),
            cloud_shadow_line(k, g, tt),
            clouds.sunDir.xyz,
            mat2x3f(clouds.sunRight.xyz, clouds.sunUp.xyz),
        );
        for (var l = 0u; l < CLOUD_SHADOW_KNOTS / 4u; l++) {
            let v = vec4f(col.knots[l * 4u], col.knots[l * 4u + 1u], col.knots[l * 4u + 2u], col.knots[l * 4u + 3u]);
            textureStore(cloud_shadow_out, vec3u(origin + tt, l), v);
            cloud_shadow_wg_tau[t * 4u + l] = v.w;
            atomicStore(&cloud_shadow_pages_meta[cloud_shadow_summary_index(slot, t, l)], bitcast<u32>(v.w));
        }
        // O maior |ΔT| entre nós seguidos por metro ao longo da coluna.
        var along = 0.0;
        if (col.len > 0.0) {
            var prev = 1.0;
            for (var n = 0u; n < CLOUD_SHADOW_KNOTS; n++) {
                let tn = exp(-col.knots[n]);
                along = max(along, (prev - tn) / (col.len / f32(CLOUD_SHADOW_KNOTS)));
                prev = tn;
            }
        }
        atomicMax(&cloud_shadow_wg_max[1], bitcast<u32>(along));
        atomicMax(&cloud_shadow_wg_max[2], bitcast<u32>(col.len));
        atomicMax(&cloud_shadow_wg_max[3], bitcast<u32>(col.lever));
    }
    workgroupBarrier();
    // O maior |ΔT| entre texels vizinhos (+x e +y, dentro da página física) nos nós 4, 8, 12 e 16.
    for (var r = 0u; r < 2u; r++) {
        let t = lid + r * CLOUD_SHADOW_PAGE_GROUP;
        if (t >= CLOUD_SHADOW_PAGE_TEXELS) { break; }
        let tt = vec2u(t % CLOUD_SHADOW_STRIDE, t / CLOUD_SHADOW_STRIDE);
        var d = 0.0;
        for (var l = 0u; l < 4u; l++) {
            let a = exp(-cloud_shadow_wg_tau[t * 4u + l]);
            if (tt.x + 1u < CLOUD_SHADOW_STRIDE) { d = max(d, abs(a - exp(-cloud_shadow_wg_tau[(t + 1u) * 4u + l]))); }
            if (tt.y + 1u < CLOUD_SHADOW_STRIDE) {
                d = max(d, abs(a - exp(-cloud_shadow_wg_tau[(t + CLOUD_SHADOW_STRIDE) * 4u + l])));
            }
        }
        atomicMax(&cloud_shadow_wg_max[0], bitcast<u32>(d / min(texel.x, texel.y)));
    }
    workgroupBarrier();
    if (lid != 0u) { return; }
    let sun = clouds.sunDir.xyz;
    cloud_shadow_meta_set_f(slot, 0u, sun.x);
    cloud_shadow_meta_set_f(slot, 1u, sun.y);
    cloud_shadow_meta_set_f(slot, 2u, sun.z);
    cloud_shadow_meta_set_f(slot, 3u, clouds.coverageMap.w);
    cloud_shadow_meta_set_u(slot, 4u, bitcast<u32>(g.x));
    cloud_shadow_meta_set_u(slot, 5u, bitcast<u32>(g.y));
    cloud_shadow_meta_set_u(slot, 6u, clouds.march.z);
    cloud_shadow_meta_set_u(slot, 7u, clouds.sunPages.y);
    for (var w = 0u; w < 4u; w++) { cloud_shadow_meta_set_u(slot, 8u + w, atomicLoad(&cloud_shadow_wg_max[w])); }
    let center = (vec2f(g) + 0.5) * f32(CLOUD_SHADOW_PAGE) * texel;
    cloud_shadow_meta_set_f(slot, 12u, cloud_shadow_segment_length(center));
    cloud_shadow_meta_set_u(slot, 13u, 0u);
    cloud_shadow_meta_set_u(slot, 14u, clouds.sunPages.z);
    cloud_shadow_meta_set_u(slot, 15u, clouds.sunPages.w);
    // O carimbo da série do atlas: a página escrita na época atual.
    cloud_shadow_stamps[slot] = cloud_shadow_clock.x;
}

/**
 * A prova `j` da página física `slot`: a coluna refeita com o sol do desenho da página (a mesma coluna; a mudança do sol
 * é da previsão) contra os nós guardados no registro — a evolução da forma e do tempo, medida.
 */
fn cloud_shadow_probe(slot: u32, j: u32) {
    if (!cloud_shadow_meta_current(slot)) { return; }
    let k = cloud_shadow_slot_level(slot);
    let g = cloud_shadow_slot_page(slot);
    let t = cloud_shadow_probe_texel(slot, clouds.march.z, j);
    let tt = vec2u(t % CLOUD_SHADOW_STRIDE, t / CLOUD_SHADOW_STRIDE);
    let sun = vec3f(cloud_shadow_meta_f(slot, 0u), cloud_shadow_meta_f(slot, 1u), cloud_shadow_meta_f(slot, 2u));
    let col = cloud_shadow_column_knots(
        cloud_shadow_texel_plane_aspect(k, g, tt, cloud_shadow_aspect(sun)),
        cloud_shadow_line(k, g, tt),
        sun,
        cloud_shadow_basis(sun),
    );
    var d = 0.0;
    for (var l = 0u; l < 4u; l++) {
        let kept = bitcast<f32>(atomicLoad(&cloud_shadow_pages_meta[cloud_shadow_summary_index(slot, t, l)]));
        d = max(d, abs(exp(-kept) - exp(-col.knots[l * 4u + 3u])));
    }
    atomicMax(&cloud_shadow_pages_meta[cloud_shadow_meta_index(slot, 13u)], bitcast<u32>(d));
}

@compute @workgroup_size(CLOUD_SHADOW_PAGE_GROUP)
fn cloud_shadow_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let slot = wid.x + wid.y * nwg.x;
    if (lid == 0u) {
        var chosen = 0u;
        if (slot < CLOUD_SHADOW_SLOT_COUNT) { chosen = atomicLoad(&cloud_shadow_work[4u + slot]); }
        cloud_shadow_wg_chosen = chosen;
    }
    if (lid < 4u) { atomicStore(&cloud_shadow_wg_max[lid], 0u); }
    let chosen = workgroupUniformLoad(&cloud_shadow_wg_chosen);
    if (slot >= CLOUD_SHADOW_SLOT_COUNT) { return; }
    if (chosen != 0u) {
        cloud_shadow_draw(slot, lid);
        return;
    }
    if (lid < CLOUD_SHADOW_PROBES) { cloud_shadow_probe(slot, lid); }
}

// ---- a escolha do quadro ----

/** Tolerância da página: a mudança prevista da transmitância até o sol num texel (um nível de 8 bits da luz plena). */
const CLOUD_SHADOW_TOLERANCE: f32 = 0.003921569;
/** Fator de segurança do gradiente medido entre texels vizinhos. */
const CLOUD_SHADOW_GRADIENT_SAFETY: f32 = 2.0;
/** Quadros sem desenho em que a página ainda vale, no máximo. */
const CLOUD_SHADOW_MAX_AGE: u32 = 240u;
/** A fila da página que precisa ser desenhada no quadro (a que entra na janela, sem carimbo, de outro conteúdo). */
const CLOUD_SHADOW_KEY_MANDATORY: u32 = 15u;

/**
 * A mudança prevista da transmitância de um texel da página física `slot` desde o desenho (espelho de
 * `shadowPageError`): o deslocamento lateral das linhas do mapa — o plano girando nos cantos da página e a coluna
 * inclinando até a ponta do trecho mais longe do plano, mais o vento que sobra (o local das nuvens no centro da página,
 * `cloud_wind_at`, menos o da camada) — × o gradiente medido com o fator de segurança; o deslocamento dos nós (o trecho
 * mudando de comprimento) × o gradiente ao longo da coluna; e a evolução da forma (`clouds.sunMap.z`: o tempo em que ela
 * muda a transmitância de 1/e).
 */
fn cloud_shadow_error(slot: u32, k: u32, g: vec2i) -> f32 {
    let sun_r = vec3f(cloud_shadow_meta_f(slot, 0u), cloud_shadow_meta_f(slot, 1u), cloud_shadow_meta_f(slot, 2u));
    let dt = max(clouds.coverageMap.w - cloud_shadow_meta_f(slot, 3u), 0.0);
    let gradient = cloud_shadow_meta_f(slot, 8u);
    let along = cloud_shadow_meta_f(slot, 9u);
    let len = cloud_shadow_meta_f(slot, 10u);
    let lever = cloud_shadow_meta_f(slot, 11u);
    let center_len = cloud_shadow_meta_f(slot, 12u);
    let br = cloud_shadow_basis(sun_r);
    let dr = clouds.sunRight.xyz - br[0];
    let du = clouds.sunUp.xyz - br[1];
    let t = cloud_shadow_texel_size(k);
    let lo = vec2f(g * i32(CLOUD_SHADOW_PAGE)) * t;
    let hi = lo + f32(CLOUD_SHADOW_STRIDE) * t;
    var shift = 0.0;
    for (var c = 0u; c < 4u; c++) {
        let x = vec2f(select(lo.x, hi.x, (c & 1u) != 0u), select(lo.y, hi.y, (c & 2u) != 0u));
        shift = max(shift, length(dr * x.x + du * x.y));
    }
    // O centro da página (o mesmo do desenho, sem a coluna da vizinha).
    let center = (vec2f(g) + 0.5) * f32(CLOUD_SHADOW_PAGE) * t;
    let mid = cloud_shadow_plane_point(center);
    let wind = length(cloud_wind_at(mid) - clouds.wind.zw) + clouds.sunMap.w;
    let lateral = shift + length(sun_r - clouds.sunDir.xyz) * lever + wind * dt;
    var knots = 0.0;
    if (center_len > 0.0) { knots = len * abs(cloud_shadow_segment_length(center) / center_len - 1.0); }
    var evolution = 0.0;
    if (clouds.sunMap.z > 0.0) { evolution = dt / clouds.sunMap.z * exp(-1.0); }
    return CLOUD_SHADOW_GRADIENT_SAFETY * gradient * lateral + along * knots + evolution;
}

/** A coluna da página (o retângulo no plano e o trecho até a distância das pontas) toca o frustum da câmera? */
fn cloud_shadow_visible(k: u32, g: vec2i, lever: f32) -> bool {
    let vp = cameras[clouds.march.w].viewProjection;
    let t = cloud_shadow_texel_size(k);
    let lo = vec2f(g * i32(CLOUD_SHADOW_PAGE)) * t;
    let hi = lo + f32(CLOUD_SHADOW_STRIDE) * t;
    let reach = max(lever, clouds.shell.w);
    var below = vec3u(0u);
    var above = vec3u(0u);
    for (var c = 0u; c < 8u; c++) {
        let x = vec2f(select(lo.x, hi.x, (c & 1u) != 0u), select(lo.y, hi.y, (c & 2u) != 0u));
        let p = cloud_shadow_plane_point(x) + clouds.sunDir.xyz * select(-reach, reach, (c & 4u) != 0u);
        let clip = vp * vec4f(p, 1.0);
        below += vec3u(vec3<bool>(clip.x < -clip.w, clip.y < -clip.w, clip.z < 0.0));
        above += vec3u(vec3<bool>(clip.x > clip.w, clip.y > clip.w, clip.z > clip.w));
    }
    return !(any(below == vec3u(8u)) || any(above == vec3u(8u)));
}

/**
 * A fila da página física `slot` (0: vale; 1…14: inválida, pela prioridade em oitavas; 15: tem de ser desenhada no
 * quadro). A prioridade (espelho de `shadowPagePriority`): a mudança (a maior entre a prevista e a medida pelas provas)
 * em tolerâncias × os quadros desde o desenho × √2 por nível mais fino × 4 vista pela câmera. A página mais velha que
 * `CLOUD_SHADOW_MAX_AGE` entra na fila 1.
 */
fn cloud_shadow_key(slot: u32) -> u32 {
    if (!cloud_shadow_meta_current(slot)) { return CLOUD_SHADOW_KEY_MANDATORY; }
    let k = cloud_shadow_slot_level(slot);
    let g = cloud_shadow_slot_page(slot);
    let age = clouds.march.z - cloud_shadow_meta_u(slot, 6u);
    let measured = bitcast<f32>(cloud_shadow_meta_u(slot, 13u));
    let e = max(cloud_shadow_error(slot, k, g), measured);
    if (e <= CLOUD_SHADOW_TOLERANCE) { return select(0u, 1u, age >= CLOUD_SHADOW_MAX_AGE); }
    let vis = cloud_shadow_visible(k, g, cloud_shadow_meta_f(slot, 11u));
    let p = e / CLOUD_SHADOW_TOLERANCE * f32(max(age, 1u)) * exp2(f32(CLOUD_SHADOW_LEVELS - 1u - k) * 0.5)
        * select(1.0, 4.0, vis);
    return clamp(1u + u32(floor(log2(p))), 1u, CLOUD_SHADOW_KEY_MANDATORY - 1u);
}

/** Páginas físicas por invocação na escolha do quadro (até 512 páginas). */
const CLOUD_SHADOW_SELECT_CHUNK: u32 = 2u;

var<workgroup> cloud_shadow_wg_hist: array<atomic<u32>, 16>;
var<workgroup> cloud_shadow_wg_cut: vec2u;

/**
 * As páginas do quadro (um grupo de `CLOUD_SHADOW_PAGE_GROUP` invocações, `CLOUD_SHADOW_SELECT_CHUNK` páginas físicas
 * seguidas por invocação): as obrigatórias todas e, até o orçamento (`clouds.sunPages.x`), as inválidas da fila mais
 * alta à mais baixa; dentro da fila do corte, pela ordem da página física (soma de prefixos no grupo: o que entra no
 * quadro não depende da ordem dos atômicos). Grava a marca de cada página física e quantas.
 */
@compute @workgroup_size(CLOUD_SHADOW_PAGE_GROUP)
fn cloud_shadow_select_main(@builtin(local_invocation_index) lid: u32) {
    if (lid < 16u) { atomicStore(&cloud_shadow_wg_hist[lid], 0u); }
    workgroupBarrier();
    var keys: array<u32, CLOUD_SHADOW_SELECT_CHUNK>;
    for (var j = 0u; j < CLOUD_SHADOW_SELECT_CHUNK; j++) {
        let slot = lid * CLOUD_SHADOW_SELECT_CHUNK + j;
        keys[j] = 0u;
        if (slot < CLOUD_SHADOW_SLOT_COUNT) { keys[j] = cloud_shadow_key(slot); }
        if (keys[j] > 0u) { atomicAdd(&cloud_shadow_wg_hist[keys[j]], 1u); }
    }
    workgroupBarrier();
    if (lid == 0u) {
        // O corte: a fila e quantas dela entram.
        var left = clouds.sunPages.x;
        var cut = vec2u(CLOUD_SHADOW_KEY_MANDATORY, atomicLoad(&cloud_shadow_wg_hist[CLOUD_SHADOW_KEY_MANDATORY]));
        left -= min(left, cut.y);
        for (var b = CLOUD_SHADOW_KEY_MANDATORY - 1u; b >= 1u; b--) {
            if (left == 0u) { break; }
            let c = atomicLoad(&cloud_shadow_wg_hist[b]);
            cut = vec2u(b, min(c, left));
            left -= cut.y;
        }
        cloud_shadow_wg_cut = cut;
    }
    let cut = workgroupUniformLoad(&cloud_shadow_wg_cut);
    var at_cut = 0u;
    for (var j = 0u; j < CLOUD_SHADOW_SELECT_CHUNK; j++) { at_cut += select(0u, 1u, keys[j] == cut.x); }
    var rank = pa_exclusive(lid, at_cut);
    var count = 0u;
    for (var j = 0u; j < CLOUD_SHADOW_SELECT_CHUNK; j++) {
        let slot = lid * CLOUD_SHADOW_SELECT_CHUNK + j;
        var chosen = keys[j] > cut.x;
        if (keys[j] == cut.x) {
            chosen = keys[j] > 0u && rank < cut.y;
            rank++;
        }
        if (slot < CLOUD_SHADOW_SLOT_COUNT) {
            atomicStore(&cloud_shadow_work[4u + slot], select(0u, 1u, chosen));
            count += select(0u, 1u, chosen);
        }
    }
    let at = pa_exclusive(lid, count);
    if (lid == CLOUD_SHADOW_PAGE_GROUP - 1u) { atomicStore(&cloud_shadow_work[0], at + count); }
}
