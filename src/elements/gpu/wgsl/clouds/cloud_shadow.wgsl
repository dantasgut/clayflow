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
// 2 colunas por invocação (289 texels, 256 invocações); a prova reparte a coluna por 32 invocações (até 7 amostras cada).
//
// Um grupo por página física. A escolhida no quadro é desenhada: os texels e o registro dela — o sol, o tempo e o quadro
// do desenho, a página global, a assinatura do conteúdo e a célula do pivô, as medidas (o maior |ΔT| entre texels
// vizinhos por metro, nos nós 4, 8, 12 e 16, com a coluna da vizinha; o maior |ΔT| entre nós seguidos por metro ao longo
// da coluna; o maior comprimento do trecho; a maior distância das pontas do trecho ao plano; o comprimento do trecho no
// centro da página) e os nós 4, 8, 12 e 16 de cada texel (o que as provas comparam) — e o carimbo da série do atlas (a
// época atual). Nas demais, a cada `CLOUD_SHADOW_PROBE_PERIOD` quadros (em rodízio), `CLOUD_SHADOW_PROBES` colunas de
// prova (texels embaralhados por quadro) refeitas e
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

/**
 * Os mapas do quadro como a escolha os deixou no registro de estado (`CLOUD_SHADOW_STATE_SLOT`; o desenho e as provas
 * correm depois dela no quadro).
 */
fn cloud_shadow_maps() -> CloudShadowMaps {
    let rec = &cloud_shadow_pages_meta[CLOUD_SHADOW_STATE_SLOT];
    return CloudShadowMaps(
        min(atomicLoad(&(*rec).page_x), 2u),
        min(atomicLoad(&(*rec).page_y), 2u),
        bitcast<f32>(atomicLoad(&(*rec).time)),
    );
}

/**
 * O registro da página física `slot` vale para a página que a janela do degrau `m` põe nela: carimbada na época da série,
 * desenhada no mesmo degrau, a mesma página global, a mesma assinatura do conteúdo e a mesma célula do pivô.
 */
fn cloud_shadow_meta_current(slot: u32, m: u32) -> bool {
    if (m == CLOUD_SHADOW_STEP_NONE) { return false; }
    let g = cloud_shadow_slot_page(slot, m);
    return cloud_shadow_stamps[slot] == cloud_shadow_clock.x
        && atomicLoad(&cloud_shadow_pages_meta[slot].step) == m
        && bitcast<i32>(atomicLoad(&cloud_shadow_pages_meta[slot].page_x)) == g.x
        && bitcast<i32>(atomicLoad(&cloud_shadow_pages_meta[slot].page_y)) == g.y
        && atomicLoad(&cloud_shadow_pages_meta[slot].signature) == clouds.sunPages.y
        && atomicLoad(&cloud_shadow_pages_meta[slot].pivot_x) == clouds.sunPages.z
        && atomicLoad(&cloud_shadow_pages_meta[slot].pivot_y) == clouds.sunPages.w;
}

var<workgroup> cloud_shadow_wg_tau: array<f32, 1156>;
var<workgroup> cloud_shadow_wg_max: array<atomic<u32>, 4>;
var<workgroup> cloud_shadow_wg_chosen: u32;

/** O desenho da página física `slot` do degrau `m` (as 256 invocações do grupo). */
fn cloud_shadow_draw(slot: u32, lid: u32, m: u32) {
    let k = cloud_shadow_slot_level(slot);
    let g = cloud_shadow_slot_page(slot, m);
    let origin = cloud_shadow_slot_origin(slot);
    let texel = cloud_shadow_step_texel(k, m);
    for (var r = 0u; r < 2u; r++) {
        let t = lid + r * CLOUD_SHADOW_PAGE_GROUP;
        if (t >= CLOUD_SHADOW_PAGE_TEXELS) { break; }
        let tt = vec2u(t % CLOUD_SHADOW_STRIDE, t / CLOUD_SHADOW_STRIDE);
        let col = cloud_shadow_column_knots(
            cloud_shadow_texel_plane(k, g, tt, m),
            cloud_shadow_line(k, g, tt),
            clouds.sunDir.xyz,
            mat2x3f(clouds.sunRight.xyz, clouds.sunUp.xyz),
        );
        for (var l = 0u; l < CLOUD_SHADOW_KNOTS / 4u; l++) {
            let v = vec4f(col.knots[l * 4u], col.knots[l * 4u + 1u], col.knots[l * 4u + 2u], col.knots[l * 4u + 3u]);
            textureStore(cloud_shadow_out, vec3u(origin + tt, l), v);
            cloud_shadow_wg_tau[t * 4u + l] = v.w;
            atomicStore(&cloud_shadow_pages_meta[slot].knots[t * 4u + l], bitcast<u32>(v.w));
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
    let rec = &cloud_shadow_pages_meta[slot];
    atomicStore(&(*rec).sun_x, bitcast<u32>(sun.x));
    atomicStore(&(*rec).sun_y, bitcast<u32>(sun.y));
    atomicStore(&(*rec).sun_z, bitcast<u32>(sun.z));
    atomicStore(&(*rec).time, bitcast<u32>(clouds.coverageMap.w));
    atomicStore(&(*rec).page_x, bitcast<u32>(g.x));
    atomicStore(&(*rec).page_y, bitcast<u32>(g.y));
    atomicStore(&(*rec).frame, clouds.march.z);
    atomicStore(&(*rec).signature, clouds.sunPages.y);
    atomicStore(&(*rec).gradient, atomicLoad(&cloud_shadow_wg_max[0]));
    atomicStore(&(*rec).along, atomicLoad(&cloud_shadow_wg_max[1]));
    atomicStore(&(*rec).len, atomicLoad(&cloud_shadow_wg_max[2]));
    atomicStore(&(*rec).lever, atomicLoad(&cloud_shadow_wg_max[3]));
    let center = (vec2f(g) + 0.5) * f32(CLOUD_SHADOW_PAGE) * texel;
    atomicStore(&(*rec).center_len, bitcast<u32>(cloud_shadow_segment_length(center)));
    atomicStore(&(*rec).measured, 0u);
    atomicStore(&(*rec).pivot_x, clouds.sunPages.z);
    atomicStore(&(*rec).pivot_y, clouds.sunPages.w);
    atomicStore(&(*rec).step, m);
    // O carimbo da série do atlas: a página escrita na época atual.
    cloud_shadow_stamps[slot] = cloud_shadow_clock.x;
}

/** Invocações por coluna de prova: a coluna repartida pelo pente (as amostras `i ≡ sub` mod 32, no máximo 7 por invocação). */
const CLOUD_SHADOW_PROBE_LANES: u32 = 32u;

/**
 * A parte de uma invocação (`sub`) da coluna de prova de coordenadas `x` (m) no plano do sol `sun` (a base `basis`):
 * τ do pente fino (0…3) e do grosso (4…7) nos nós 4, 8, 12 e 16 — a soma, nas células do pente da invocação, de
 * `r·max(0, b − max(a, nó))` (a célula `[a, b]` recortada ao trecho, `r` a extinção no meio dela) — e a mistura dos dois
 * pentes (8). A mesma conta de `cloud_shadow_column_knots`, em outra ordem de soma.
 */
fn cloud_shadow_probe_part(x: vec2f, line: vec2i, sun: vec3f, basis: mat2x3f, sub: u32) -> array<f32, 9> {
    var out: array<f32, 9>;
    for (var e = 0u; e < 9u; e++) { out[e] = 0.0; }
    let o0 = clouds.sunFrame.xyz + basis[0] * x.x + basis[1] * x.y;
    let entry = cloud_sun_entry(o0, sun);
    let segs = cloud_shell_segments(o0 + sun * entry, -sun, 1e9);
    if (segs.y <= segs.x) { return out; }
    let hi = entry - segs.x;
    let lo = entry - segs.y;
    let len = hi - lo;
    let lv = max(log2(len / (f32(CLOUD_SHADOW_STEPS) * CLOUD_SHADOW_SPACING)), CLOUD_SHADOW_MIN_LEVEL - 1.0);
    let n = max(ceil(lv), CLOUD_SHADOW_MIN_LEVEL);
    out[8] = lv - (n - 1.0);
    let dl = CLOUD_SHADOW_SPACING * exp2(n);
    let knot_len = len / f32(CLOUD_SHADOW_KNOTS);
    let phi = f32(cloud_shadow_hash(line) & 0xffffu) / 65536.0 * CLOUD_SHADOW_SHIFT;
    let m0 = i32(floor((hi - phi) / dl)) + 1;
    for (var i = sub; i < CLOUD_SHADOW_STEPS + 4u; i += CLOUD_SHADOW_PROBE_LANES) {
        let m = m0 - i32(i);
        let s = f32(m) * dl + phi;
        if (s + dl <= lo) { break; }
        var rf = 0.0;
        let fa = max(s - 0.5 * dl, lo);
        let fb = min(s + 0.5 * dl, hi);
        if (fb > fa) {
            rf = cloud_shadow_extinction(o0, sun, 0.5 * (fa + fb));
            for (var q = 0u; q < 4u; q++) {
                let at = hi - f32(4u * q + 4u) * knot_len;
                out[q] += rf * max(0.0, fb - max(fa, at));
            }
        }
        if ((m & 1) == 0) {
            let ca = max(s - dl, lo);
            let cb = min(s + dl, hi);
            if (cb > ca) {
                var rc = rf;
                if (ca > s - dl || cb < s + dl) { rc = cloud_shadow_extinction(o0, sun, 0.5 * (ca + cb)); }
                for (var q = 0u; q < 4u; q++) {
                    let at = hi - f32(4u * q + 4u) * knot_len;
                    out[4u + q] += rc * max(0.0, cb - max(ca, at));
                }
            }
        }
    }
    return out;
}

var<workgroup> cloud_shadow_wg_probe_go: u32;

/**
 * As `CLOUD_SHADOW_PROBES` provas da página física `slot` (as 256 invocações do grupo, `CLOUD_SHADOW_PROBE_LANES` por
 * coluna): a coluna do texel refeita como o desenho do quadro a faria (o sol e o plano de agora) contra os nós guardados
 * no registro — a mudança inteira do que a página mostra, medida: a evolução da forma, o tempo e o sol andando. A
 * previsão pela geometria só vê a nuvem que já está na página (o gradiente medido nela): a página desenhada sem nuvem,
 * com o sol descendo, passava a mostrar sol onde a coluna nova já cortava a nuvem vizinha e só era refeita pela idade
 * (`CLOUD_SHADOW_MAX_AGE`) — o chão aceso sob as nuvens de 3,5–6 km no `solposto-chao` (R21 rodada 24). Espelho das
 * provas do esquema em `cloudShadowPages.test.ts`. A coluna numa invocação só (um laço de até 196 amostras) com 4 das
 * 256 ativas custava, com o sol a 4°, mais que o resto do passe.
 */
fn cloud_shadow_probes(slot: u32, lid: u32, m: u32) {
    let j = lid / CLOUD_SHADOW_PROBE_LANES;
    let sub = lid % CLOUD_SHADOW_PROBE_LANES;
    let k = cloud_shadow_slot_level(slot);
    let g = cloud_shadow_slot_page(slot, m);
    let rec = &cloud_shadow_pages_meta[slot];
    let t = cloud_shadow_probe_texel(slot, clouds.march.z, min(j, CLOUD_SHADOW_PROBES - 1u));
    let tt = vec2u(t % CLOUD_SHADOW_STRIDE, t / CLOUD_SHADOW_STRIDE);
    var part: array<f32, 9>;
    for (var e = 0u; e < 9u; e++) { part[e] = 0.0; }
    if (j < CLOUD_SHADOW_PROBES) {
        part = cloud_shadow_probe_part(
            cloud_shadow_texel_plane(k, g, tt, m),
            cloud_shadow_line(k, g, tt),
            clouds.sunDir.xyz,
            mat2x3f(clouds.sunRight.xyz, clouds.sunUp.xyz),
            sub,
        );
        for (var e = 0u; e < 8u; e++) { cloud_shadow_wg_tau[lid * 8u + e] = part[e]; }
    }
    workgroupBarrier();
    // A soma das partes de cada coluna em árvore (5 passos).
    for (var w = CLOUD_SHADOW_PROBE_LANES / 2u; w > 0u; w /= 2u) {
        if (j < CLOUD_SHADOW_PROBES && sub < w) {
            for (var e = 0u; e < 8u; e++) {
                cloud_shadow_wg_tau[lid * 8u + e] += cloud_shadow_wg_tau[(lid + w) * 8u + e];
            }
        }
        workgroupBarrier();
    }
    if (j >= CLOUD_SHADOW_PROBES || sub != 0u) { return; }
    var d = 0.0;
    for (var l = 0u; l < 4u; l++) {
        let tau = mix(cloud_shadow_wg_tau[lid * 8u + l], cloud_shadow_wg_tau[lid * 8u + 4u + l], part[8]);
        let kept = bitcast<f32>(atomicLoad(&(*rec).knots[t * 4u + l]));
        d = max(d, abs(exp(-kept) - exp(-tau)));
    }
    atomicMax(&(*rec).measured, bitcast<u32>(d));
}

@compute @workgroup_size(CLOUD_SHADOW_PAGE_GROUP)
fn cloud_shadow_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let slot = wid.x + wid.y * nwg.x;
    // A marca do quadro e o degrau da página física nos mapas do quadro (uniformes no grupo: as barreiras do desenho).
    if (lid == 0u) {
        var chosen = 0u;
        var step = CLOUD_SHADOW_STEP_NONE;
        if (slot < CLOUD_SHADOW_SLOT_COUNT) {
            chosen = atomicLoad(&cloud_shadow_work[4u + slot]);
            step = cloud_shadow_slot_step(slot, cloud_shadow_maps());
        }
        cloud_shadow_wg_chosen = min(chosen, 1u) | (step << 1u);
    }
    if (lid < 4u) { atomicStore(&cloud_shadow_wg_max[lid], 0u); }
    let mark = workgroupUniformLoad(&cloud_shadow_wg_chosen);
    let chosen = mark & 1u;
    let m = mark >> 1u;
    if (slot >= CLOUD_SHADOW_SLOT_COUNT || m == CLOUD_SHADOW_STEP_NONE) { return; }
    if (chosen != 0u) {
        cloud_shadow_draw(slot, lid, m);
        return;
    }
    // As provas, em rodízio, das páginas que valem (a condição uniforme no grupo: as barreiras da soma).
    if (lid == 0u) {
        cloud_shadow_wg_probe_go = select(
            0u,
            1u,
            cloud_shadow_probes_now(slot, clouds.march.z) && cloud_shadow_meta_current(slot, m),
        );
    }
    if (workgroupUniformLoad(&cloud_shadow_wg_probe_go) == 0u) { return; }
    cloud_shadow_probes(slot, lid, m);
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
fn cloud_shadow_error(slot: u32, k: u32, g: vec2i, m: u32) -> f32 {
    let rec = &cloud_shadow_pages_meta[slot];
    let sun_r = vec3f(
        bitcast<f32>(atomicLoad(&(*rec).sun_x)),
        bitcast<f32>(atomicLoad(&(*rec).sun_y)),
        bitcast<f32>(atomicLoad(&(*rec).sun_z)),
    );
    let dt = max(clouds.coverageMap.w - bitcast<f32>(atomicLoad(&(*rec).time)), 0.0);
    let gradient = bitcast<f32>(atomicLoad(&(*rec).gradient));
    let along = bitcast<f32>(atomicLoad(&(*rec).along));
    let len = bitcast<f32>(atomicLoad(&(*rec).len));
    let lever = bitcast<f32>(atomicLoad(&(*rec).lever));
    let center_len = bitcast<f32>(atomicLoad(&(*rec).center_len));
    let br = cloud_shadow_basis(sun_r);
    let dr = clouds.sunRight.xyz - br[0];
    let du = clouds.sunUp.xyz - br[1];
    let t = cloud_shadow_step_texel(k, m);
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
fn cloud_shadow_visible(k: u32, g: vec2i, lever: f32, m: u32) -> bool {
    let vp = cameras[clouds.march.w].viewProjection;
    let t = cloud_shadow_step_texel(k, m);
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
 * A fila da página física `slot` do degrau `m` nos mapas `maps` (0: vale ou fora dos mapas; 1…14: inválida, pela
 * prioridade em oitavas; 15: tem de ser desenhada no quadro). A prioridade (espelho de `shadowPagePriority`): a mudança
 * (a maior entre a prevista e a medida pelas provas) em tolerâncias × os quadros desde o desenho × √2 por nível mais fino
 * × 4 vista pela câmera. A página mais velha que `CLOUD_SHADOW_MAX_AGE` entra na fila 1. A página sem registro que vale
 * de um mapa lido no quadro é obrigatória; a do mapa novo da troca de degrau, que ainda não é lido (peso 0), entra na
 * fila `CLOUD_SHADOW_KEY_PREPARE`, dentro do orçamento: o mapa novo é desenhado ao longo de alguns quadros.
 */
fn cloud_shadow_key(slot: u32, m: u32, maps: CloudShadowMaps) -> u32 {
    if (m == CLOUD_SHADOW_STEP_NONE) { return 0u; }
    if (!cloud_shadow_meta_current(slot, m)) {
        return select(CLOUD_SHADOW_KEY_PREPARE, CLOUD_SHADOW_KEY_MANDATORY, cloud_shadow_step_weight(maps, m) > 0.0);
    }
    let k = cloud_shadow_slot_level(slot);
    let g = cloud_shadow_slot_page(slot, m);
    let age = clouds.march.z - atomicLoad(&cloud_shadow_pages_meta[slot].frame);
    let measured = bitcast<f32>(atomicLoad(&cloud_shadow_pages_meta[slot].measured));
    let e = max(cloud_shadow_error(slot, k, g, m), measured);
    if (e <= CLOUD_SHADOW_TOLERANCE) { return select(0u, 1u, age >= CLOUD_SHADOW_MAX_AGE); }
    let vis = cloud_shadow_visible(k, g, bitcast<f32>(atomicLoad(&cloud_shadow_pages_meta[slot].lever)), m);
    let p = e / CLOUD_SHADOW_TOLERANCE * f32(max(age, 1u)) * exp2(f32(CLOUD_SHADOW_LEVELS - 1u - k) * 0.5)
        * select(1.0, 4.0, vis);
    return clamp(1u + u32(floor(log2(p))), 1u, CLOUD_SHADOW_KEY_MANDATORY - 1u);
}

/**
 * Os mapas do quadro antes da escolha (espelho de `shadowMapsBegin`): sem estado na época da série, o degrau do sol, só
 * ele; a troca que chegou ao peso 1 termina (o `leaving` sai); parado num degrau, o sol que pede o vizinho começa a troca
 * (o `entering` novo com peso 0: as páginas dele são desenhadas dentro do orçamento até o mapa inteiro valer) e o que pede o
 * degrau a dois passos troca de uma vez (as páginas físicas dos dois se sobrepõem; só o sol que salta mais de 9° num
 * quadro); na troca, o sol que volta ao `leaving` inverte a troca (o peso complementar: o mapa de onde seguiu residente e
 * mantido).
 */
fn cloud_shadow_maps_begin() -> CloudShadowMaps {
    let sun = clouds.sunDir.xyz;
    if (cloud_shadow_stamps[CLOUD_SHADOW_STATE_SLOT] != cloud_shadow_clock.x) {
        let s = cloud_shadow_step_of(cloud_shadow_continuous(sun), 1.0);
        return CloudShadowMaps(s, s, 1.0);
    }
    var maps = cloud_shadow_maps();
    if (maps.leaving != maps.entering && maps.weight >= 1.0) { maps.leaving = maps.entering; }
    let wanted = cloud_shadow_step_target(maps.entering, sun);
    if (maps.leaving == maps.entering) {
        if (wanted != maps.entering) {
            if (max(wanted, maps.entering) - min(wanted, maps.entering) == 1u) {
                return CloudShadowMaps(maps.entering, wanted, 0.0);
            }
            return CloudShadowMaps(wanted, wanted, 1.0);
        }
        return CloudShadowMaps(maps.entering, maps.entering, 1.0);
    }
    if (wanted == maps.leaving) { return CloudShadowMaps(maps.entering, maps.leaving, 1.0 - maps.weight); }
    return maps;
}

/** Páginas físicas por invocação na escolha do quadro (até 3072 páginas). */
const CLOUD_SHADOW_SELECT_CHUNK: u32 = 12u;
/** A fila das páginas do mapa novo da troca de degrau (o meio das 14: as que mudaram muito no mapa lido passam antes). */
const CLOUD_SHADOW_KEY_PREPARE: u32 = 8u;

var<workgroup> cloud_shadow_wg_hist: array<atomic<u32>, 16>;
var<workgroup> cloud_shadow_wg_cut: vec2u;
var<workgroup> cloud_shadow_wg_maps: CloudShadowMaps;
var<workgroup> cloud_shadow_wg_pending: atomic<u32>;

/**
 * As páginas do quadro (um grupo de `CLOUD_SHADOW_PAGE_GROUP` invocações, `CLOUD_SHADOW_SELECT_CHUNK` páginas físicas
 * seguidas por invocação): os mapas do quadro (`cloud_shadow_maps_begin`); as obrigatórias todas e, até o orçamento
 * (`clouds.sunPages.x`), as inválidas da fila mais alta à mais baixa; dentro da fila do corte, pela ordem da página física
 * (soma de prefixos no grupo: o que entra no quadro não depende da ordem dos atômicos). Grava a marca de cada página
 * física e quantas, e o estado dos mapas: na troca, com todas as páginas do mapa novo valendo depois do desenho do
 * quadro, o peso dele sobe `1/CLOUD_SHADOW_STEP_FRAMES` (o estado entre quadros na série do registro, carimbado).
 */
@compute @workgroup_size(CLOUD_SHADOW_PAGE_GROUP)
fn cloud_shadow_select_main(@builtin(local_invocation_index) lid: u32) {
    if (lid < 16u) { atomicStore(&cloud_shadow_wg_hist[lid], 0u); }
    if (lid == 0u) {
        cloud_shadow_wg_maps = cloud_shadow_maps_begin();
        atomicStore(&cloud_shadow_wg_pending, 0u);
    }
    workgroupBarrier();
    let maps = cloud_shadow_wg_maps;
    var keys: array<u32, CLOUD_SHADOW_SELECT_CHUNK>;
    var fresh = 0u;
    for (var j = 0u; j < CLOUD_SHADOW_SELECT_CHUNK; j++) {
        let slot = lid * CLOUD_SHADOW_SELECT_CHUNK + j;
        keys[j] = 0u;
        if (slot < CLOUD_SHADOW_SLOT_COUNT) {
            let m = cloud_shadow_slot_step(slot, maps);
            keys[j] = cloud_shadow_key(slot, m, maps);
            // As páginas do mapa novo que ainda não valem (a marca para a contagem depois do corte).
            if (maps.leaving != maps.entering && m == maps.entering && !cloud_shadow_meta_current(slot, m)) { fresh |= 1u << j; }
        }
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
    var pending = 0u;
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
            if ((fresh & (1u << j)) != 0u && !chosen) { pending++; }
        }
    }
    if (pending > 0u) { atomicAdd(&cloud_shadow_wg_pending, pending); }
    let at = pa_exclusive(lid, count);
    if (lid == CLOUD_SHADOW_PAGE_GROUP - 1u) { atomicStore(&cloud_shadow_work[0], at + count); }
    workgroupBarrier();
    if (lid != 0u) { return; }
    var next = maps;
    if (next.leaving != next.entering && atomicLoad(&cloud_shadow_wg_pending) == 0u) {
        next.weight = min(next.weight + 1.0 / CLOUD_SHADOW_STEP_FRAMES, 1.0);
    }
    let rec = &cloud_shadow_pages_meta[CLOUD_SHADOW_STATE_SLOT];
    atomicStore(&(*rec).page_x, next.leaving);
    atomicStore(&(*rec).page_y, next.entering);
    atomicStore(&(*rec).time, bitcast<u32>(next.weight));
    cloud_shadow_stamps[CLOUD_SHADOW_STATE_SLOT] = cloud_shadow_clock.x;
}
