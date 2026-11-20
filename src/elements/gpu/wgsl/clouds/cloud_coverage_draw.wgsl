// O mapa de cobertura em níveis por páginas (spec 041, R21 rodada 19, T077): a escolha das páginas do quadro
// (`cloud_coverage_select_main`, um grupo) e o desenho das escolhidas (`cloud_coverage_draw_main`, `clouds.coveragePages.x`
// grupos, cada um percorre a lista com passo do número de grupos). O valor de um texel é `cloud_coverage_value(w)` no
// centro dele (m, referencial do vento), do kernel que inclui este módulo: a função de cobertura (ou os campos da camada)
// ou o tempo. Espelho de `reference/cloudCoverageLevels.ts`.
//
// A página física vale para a página que a janela do quadro põe nela quando está carimbada na época da série (C2), guarda
// a mesma página global e a mesma assinatura do conteúdo (os valores da camada e das funções) e, no anel de fora da
// janela (o valor levado ao do nível seguinte), a mesma janela. As que não valem (a que
// entra na janela, o conteúdo que mudou, a série que recomeçou) são desenhadas no mesmo quadro, acima do orçamento; com o
// conteúdo que muda no tempo (`clouds.coveragePages.z`: a função de cobertura ou o tempo), as demais são refeitas pela
// idade, até o orçamento — a fila em oitavas de (quadros desde o desenho × √2 por nível mais fino); dentro do corte, pela
// ordem da página física (somas de prefixos no grupo: independe dos atômicos). Sem isso, a página desenhada não muda.
// Teto constante: a escolha percorre `CLOUD_COVERAGE_SELECT_CHUNK` páginas por invocação; o desenho, no máximo todas as
// páginas físicas (`CLOUD_COVERAGE_MAX_SLOTS`), 1 texel por invocação (`CLOUD_COVERAGE_PAGE_GROUP` = 16²).
// Requer: CLOUD_COVERAGE_PAGE_GROUP, clouds, cloud_coverage_pages, page_alloc, cloud_coverage_value, cloud_coverage_out,
// cloud_coverage_records, cloud_coverage_stamps, cloud_coverage_clock, cloud_coverage_work.

/** Teto de páginas físicas (32 por invocação da escolha). */
const CLOUD_COVERAGE_MAX_SLOTS: u32 = 8192u;
/** Páginas físicas por invocação na escolha do quadro. */
const CLOUD_COVERAGE_SELECT_CHUNK: u32 = 32u;
/** Palavras do registro de uma página física: a página global x e y, o quadro do desenho, a assinatura, a janela x e y. */
const CLOUD_COVERAGE_RECORD: u32 = 8u;
/** A fila da página que precisa ser desenhada no quadro. */
const CLOUD_COVERAGE_KEY_MANDATORY: u32 = 15u;

/**
 * O valor do texel no ponto `p` (m) do nível `k`: a função no centro dele e, no anel de fora da janela, levado à bilinear
 * dos texels do nível seguinte (os quatro valores da função nos centros deles) — na borda, o que o nível seguinte lê ali.
 */
fn cloud_coverage_texel_value(p: vec2f, k: u32) -> vec4f {
    var v = cloud_coverage_value(p);
    let b = cloud_coverage_ring(p, k);
    if (b <= 0.0) { return v; }
    let t = cloud_coverage_texel_size(k + 1u);
    let x = p / t - 0.5;
    let i = floor(x);
    let f = x - i;
    let a00 = cloud_coverage_value((i + vec2f(0.5, 0.5)) * t);
    let a10 = cloud_coverage_value((i + vec2f(1.5, 0.5)) * t);
    let a01 = cloud_coverage_value((i + vec2f(0.5, 1.5)) * t);
    let a11 = cloud_coverage_value((i + vec2f(1.5, 1.5)) * t);
    let coarse = mix(mix(a00, a10, f.x), mix(a01, a11, f.x), f.y);
    return mix(v, coarse, b);
}

/** O desenho da página física `slot` (as invocações do grupo, um texel cada): os texels, o registro e o carimbo. */
fn cloud_coverage_draw(slot: u32, lid: u32) {
    let k = cloud_coverage_slot_level(slot);
    let g = cloud_coverage_slot_page(slot);
    let tt = vec2u(lid % CLOUD_COVERAGE_PAGE, lid / CLOUD_COVERAGE_PAGE);
    let v = cloud_coverage_texel_value(cloud_coverage_texel_point(k, g, tt), k);
    textureStore(cloud_coverage_out, cloud_coverage_store_texel(g, tt), k, clamp(v, vec4f(0.0), vec4f(1.0)));
    if (lid != 0u) { return; }
    let o = slot * CLOUD_COVERAGE_RECORD;
    cloud_coverage_records[o] = bitcast<u32>(g.x);
    cloud_coverage_records[o + 1u] = bitcast<u32>(g.y);
    cloud_coverage_records[o + 2u] = clouds.march.z;
    cloud_coverage_records[o + 3u] = clouds.coveragePages.y;
    let win = cloud_coverage_window(k);
    cloud_coverage_records[o + 4u] = bitcast<u32>(win.x);
    cloud_coverage_records[o + 5u] = bitcast<u32>(win.y);
    // O carimbo da série do atlas: a página escrita na época atual.
    cloud_coverage_stamps[slot] = cloud_coverage_clock.x;
}

var<workgroup> cloud_coverage_wg_count: u32;

@compute @workgroup_size(CLOUD_COVERAGE_PAGE_GROUP)
fn cloud_coverage_draw_main(
    @builtin(workgroup_id) wid: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    if (lid == 0u) {
        cloud_coverage_wg_count = min(
            min(atomicLoad(&cloud_coverage_work[0]), cloud_coverage_slot_count()),
            CLOUD_COVERAGE_MAX_SLOTS,
        );
    }
    let count = workgroupUniformLoad(&cloud_coverage_wg_count);
    let groups = nwg.x * nwg.y;
    for (var i = wid.x + wid.y * nwg.x; i < count; i += groups) {
        cloud_coverage_draw(atomicLoad(&cloud_coverage_work[4u + i]), lid);
    }
}

// ---- a escolha do quadro ----

/**
 * O registro da página física `slot` vale para a página que a janela do quadro põe nela: carimbada na época da série, a
 * mesma página global, a mesma assinatura e, se ela está no anel de fora da janela de agora ou da do desenho, a mesma
 * janela (o anel guarda o valor levado ao do nível seguinte pela distância à borda da janela).
 */
fn cloud_coverage_current(slot: u32) -> bool {
    let k = cloud_coverage_slot_level(slot);
    let g = cloud_coverage_slot_page(slot);
    let o = slot * CLOUD_COVERAGE_RECORD;
    let win = cloud_coverage_window(k);
    let drawn = vec2i(bitcast<i32>(cloud_coverage_records[o + 4u]), bitcast<i32>(cloud_coverage_records[o + 5u]));
    let ring = cloud_coverage_in_ring(g, win) || cloud_coverage_in_ring(g, drawn);
    return cloud_coverage_stamps[slot] == cloud_coverage_clock.x
        && bitcast<i32>(cloud_coverage_records[o]) == g.x
        && bitcast<i32>(cloud_coverage_records[o + 1u]) == g.y
        && cloud_coverage_records[o + 3u] == clouds.coveragePages.y
        && (!ring || all(drawn == win));
}

/**
 * A fila da página física `slot` (0: vale; 1…14: refeita pela idade, em oitavas de quadros desde o desenho × √2 por nível
 * mais fino; 15: tem de ser desenhada no quadro).
 */
fn cloud_coverage_key(slot: u32) -> u32 {
    if (!cloud_coverage_current(slot)) { return CLOUD_COVERAGE_KEY_MANDATORY; }
    if (clouds.coveragePages.z == 0u) { return 0u; }
    let age = clouds.march.z - cloud_coverage_records[slot * CLOUD_COVERAGE_RECORD + 2u];
    if (age == 0u) { return 0u; }
    let k = cloud_coverage_slot_level(slot);
    let p = f32(age) * exp2(f32(cloud_coverage_levels() - 1u - k) * 0.5);
    return clamp(1u + u32(floor(log2(p))), 1u, CLOUD_COVERAGE_KEY_MANDATORY - 1u);
}

var<workgroup> cloud_coverage_wg_hist: array<atomic<u32>, 16>;
var<workgroup> cloud_coverage_wg_cut: vec2u;

/**
 * As páginas do quadro (um grupo de `CLOUD_COVERAGE_PAGE_GROUP` invocações, `CLOUD_COVERAGE_SELECT_CHUNK` páginas físicas
 * seguidas por invocação): as obrigatórias todas e, até o orçamento (`clouds.coveragePages.x`), as da fila mais alta à
 * mais baixa; dentro da fila do corte, pela ordem da página física. Grava a contagem e a lista em ordem.
 */
@compute @workgroup_size(CLOUD_COVERAGE_PAGE_GROUP)
fn cloud_coverage_select_main(@builtin(local_invocation_index) lid: u32) {
    if (lid < 16u) { atomicStore(&cloud_coverage_wg_hist[lid], 0u); }
    workgroupBarrier();
    let slots = min(cloud_coverage_slot_count(), CLOUD_COVERAGE_MAX_SLOTS);
    var keys: array<u32, CLOUD_COVERAGE_SELECT_CHUNK>;
    for (var j = 0u; j < CLOUD_COVERAGE_SELECT_CHUNK; j++) {
        let slot = lid * CLOUD_COVERAGE_SELECT_CHUNK + j;
        keys[j] = 0u;
        if (slot < slots) { keys[j] = cloud_coverage_key(slot); }
        if (keys[j] > 0u) { atomicAdd(&cloud_coverage_wg_hist[keys[j]], 1u); }
    }
    workgroupBarrier();
    if (lid == 0u) {
        // O corte: a fila e quantas dela entram.
        var left = clouds.coveragePages.x;
        var cut = vec2u(CLOUD_COVERAGE_KEY_MANDATORY, atomicLoad(&cloud_coverage_wg_hist[CLOUD_COVERAGE_KEY_MANDATORY]));
        left -= min(left, cut.y);
        for (var b = CLOUD_COVERAGE_KEY_MANDATORY - 1u; b >= 1u; b--) {
            if (left == 0u) { break; }
            let c = atomicLoad(&cloud_coverage_wg_hist[b]);
            cut = vec2u(b, min(c, left));
            left -= cut.y;
        }
        cloud_coverage_wg_cut = cut;
    }
    let cut = workgroupUniformLoad(&cloud_coverage_wg_cut);
    var at_cut = 0u;
    for (var j = 0u; j < CLOUD_COVERAGE_SELECT_CHUNK; j++) { at_cut += select(0u, 1u, keys[j] == cut.x); }
    var rank = pa_exclusive(lid, at_cut);
    var chosen = 0u;
    var count = 0u;
    for (var j = 0u; j < CLOUD_COVERAGE_SELECT_CHUNK; j++) {
        var take = keys[j] > cut.x;
        if (keys[j] == cut.x) {
            take = keys[j] > 0u && rank < cut.y;
            rank++;
        }
        if (take) {
            chosen |= 1u << j;
            count++;
        }
    }
    var at = pa_exclusive(lid, count);
    if (lid == CLOUD_COVERAGE_PAGE_GROUP - 1u) { atomicStore(&cloud_coverage_work[0], at + count); }
    for (var j = 0u; j < CLOUD_COVERAGE_SELECT_CHUNK; j++) {
        if ((chosen & (1u << j)) == 0u) { continue; }
        atomicStore(&cloud_coverage_work[4u + at], lid * CLOUD_COVERAGE_SELECT_CHUNK + j);
        at++;
    }
}
