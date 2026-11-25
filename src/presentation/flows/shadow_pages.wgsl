// Páginas do mapa de sombra virtual (spec 034, T060), no estágio de sombra, antes do desenho. O atlas é um só para
// todas as vistas de sombra da cena (spec 013): cada vista viva tem a sua faixa da tabela e dos pedidos e, no espaço de
// trabalho, a sua seção (o estado, as filas por nível, as necessidades, os pedidos no referencial do quadro, as
// dinâmicas e os retângulos das instâncias no plano dela); as páginas físicas, as livres e a lista das sujas são comuns
// (cada página suja leva a vista). As etapas por vista percorrem as vistas vivas com teto constante (`SV_MAX_VIEWS`):
//   1. `sp_bounds_main` (um despacho por geometria): a caixa dos vértices da geometria do grupo, no espaço do objeto;
//   2. `sp_clear_main`: os contadores do quadro, as páginas físicas em uso e as instâncias dos desenhos zerados;
//   3. `sp_instances_main` (uma invocação por instância): o retângulo da instância no plano da luz (a caixa pela matriz
//      de mundo); a instância que se moveu ou se deformou desde o quadro anterior (a série dos retângulos, atraso 1)
//      entra na lista das dinâmicas com o retângulo de antes e o de agora;
//   3b. `sp_requests_main` (uma por página virtual): os pedidos do quadro anterior (a série dos pedidos) no referencial
//      deste quadro;
//   4. `sp_update_main` (uma por página virtual): a página do quadro anterior (a tabela no começo do atlas, refeita no
//      lugar) segue quando ainda é a
//      mesma página global, foi pedida há poucos quadros, a série do atlas a tem carimbada na época atual e
//      nenhuma dinâmica a tocou; a pedida (os pedidos do quadro anterior, a
//      série dos pedidos) sem página física precisa de alocação; a tocada, de redesenho — e `sp_rank_main` monta as filas
//      de cada nível na ordem do índice;
//   5. `sp_free_main` (um grupo): as páginas físicas que nenhuma página virtual segura, em ordem;
//   6. `sp_allocate_main` (um grupo): as filas por nível, do mais grosso ao mais fino (a reserva grossa primeiro), até o
//      orçamento do quadro — a página nova recebe uma física livre — e a lista das sujas a desenhar. As filas, as livres
//      e a alocação saem em ordem (somas de prefixos no grupo): a imagem não depende da ordem dos atômicos;
//      `sp_fill_main` (um grupo por posição da lista) preenche as sujas com o fundo. O orçamento é um só para as
//      vistas (spec 013, R7): a reserva grossa de cada vista primeiro, depois os níveis seguintes de todas em rodízio; a
//      vista cujo cache recomeça leva o que pediu sem tirar o orçamento das outras (`sp_allocate_main`);
//   7. os pares instância × página suja (a instância cujo retângulo toca a página): `sp_pairs_count_main` conta os de
//      cada grupo, `sp_pairs_base_main` reparte a reserva dos pares (`sp_pairs`, de tamanho fixo) entre os grupos em
//      ordem e escreve a contagem de instâncias de cada desenho indireto, `sp_pairs_main` escreve cada par no trecho do
//      seu grupo;
//   8. as malhas grandes em aglomerados: `sp_cluster_bounds_main` (um despacho por geometria) dá a caixa de cada
//      aglomerado (na malha adaptativa, só os dos índices do quadro), `sp_cluster_box_main` a da geometria pelas deles
//      (no lugar da etapa 1), e `sp_clusters_main` (um despacho por grupo) monta a lista dos pares (aglomerado, página
//      suja);
//   9. os sprites que projetam (esferas impostoras, um despacho por fonte de pontos): `ss_rect_main`, antes da tabela,
//      dá o retângulo da fonte no plano da luz e a põe entre as dinâmicas; `ss_pairs_main`, depois das sujas, monta a
//      lista (sprite, página suja) pelas páginas que o disco de cada um alcança em cada nível.
// O espaço de trabalho do quadro é um buffer só de palavras (`sp_scratch`), em seções; os contadores no início.
// Laços com teto constante.
// Requer: shadow_virtual, shadow_pages_constants, shadow_pages_views, page_alloc (a soma de prefixos do grupo), vertex_bounds (a caixa dos
// vértices), WORKGROUP_SIZE e os recursos
// de cada entrada.

fn sp_f(i: u32) -> f32 {
    return bitcast<f32>(atomicLoad(&sp_scratch[i]));
}

fn sp_set_f(i: u32, v: f32) {
    atomicStore(&sp_scratch[i], bitcast<u32>(v));
}

/** A primeira palavra da seção da vista `v` no `sp_scratch`. */
fn sp_vb(v: u32) -> u32 {
    return sp.viewBase + v * sp.viewStride;
}

/** A vista e o índice dentro dela da invocação `i` de um despacho de `per` invocações por vista. */
fn sp_split(i: u32, per: u32) -> vec2u {
    let n = max(per, 1u);
    return vec2u(i / n, i % n);
}

/**
 * O ponto do mundo das coordenadas do plano `l.xy` e da profundidade `l.z` da vista (o inverso de `sv_light`): na vista
 * em perspectiva o plano volta a metros pela profundidade e a tangente; depois, a translação e a rotação do referencial.
 */
fn sp_unproject(m: ShadowMatrix, l: vec3f) -> vec3f {
    let v = select(l, vec3f(l.xy * l.z * m.origin.w, l.z), m.kind == 1u);
    return rigid_rotation_inverse(m.lightView) * (v - m.lightView[3].xyz);
}

/** A entrada `slot` (de `sv_slot`) da tabela da vista, na faixa dela no atlas. */
fn sp_table_load(m: ShadowMatrix, slot: vec2u) -> vec4u {
    let w = sv_table_word(m, slot);
    return vec4u(sp_atlas[w], sp_atlas[w + 1u], sp_atlas[w + 2u], sp_atlas[w + 3u]);
}

fn sp_table_store(m: ShadowMatrix, slot: vec2u, e: vec4u) {
    let w = sv_table_word(m, slot);
    sp_atlas[w] = e.x;
    sp_atlas[w + 1u] = e.y;
    sp_atlas[w + 2u] = e.z;
    sp_atlas[w + 3u] = e.w;
}

/** O retângulo (x0, y0, x1, y1) da página global `g` do nível `k` no plano da luz, com a borda de 1 texel. */
fn sp_page_rect(m: ShadowMatrix, k: u32, g: vec2i) -> vec4f {
    let p = sv_page_size(m, k);
    let t = sv_texel(m, k);
    return vec4f(vec2f(g) * p - t, vec2f(g + vec2i(1)) * p + t);
}

fn sp_overlap(a: vec4f, b: vec4f) -> bool {
    return a.x <= b.z && b.x <= a.z && a.y <= b.w && b.y <= a.w;
}

/**
 * Põe o retângulo `u` (o de antes unido ao de agora, no plano da luz da vista `v`) na lista das dinâmicas da vista;
 * cheia, fica o aviso `overflow` (`SP_OVERFLOW_*`: o que responde pelo que não coube).
 */
fn sp_push_dynamic(v: u32, u: vec4f, overflow: u32) {
    let base = sp_vb(v);
    let d = atomicAdd(&sp_scratch[base + SPV_DYNAMIC_COUNT], 1u);
    if (d >= sp.dynamicCap) {
        atomicMax(&sp_scratch[base + SPV_OVERFLOW], overflow);
        return;
    }
    let o = base + sp.dynamicBase + d * 4u;
    sp_set_f(o, u.x);
    sp_set_f(o + 1u, u.y);
    sp_set_f(o + 2u, u.z);
    sp_set_f(o + 3u, u.w);
}

// ---- 1. a caixa de uma geometria ----

@compute @workgroup_size(256)
fn sp_bounds_main(@builtin(local_invocation_index) lid: u32) {
    let box = vertex_bounds(lid);
    if (lid == 0u) {
        let b = sp.boundsBase + sp_geometry.group * 6u;
        sp_set_f(b, box[0].x);
        sp_set_f(b + 1u, box[0].y);
        sp_set_f(b + 2u, box[0].z);
        sp_set_f(b + 3u, box[1].x);
        sp_set_f(b + 4u, box[1].y);
        sp_set_f(b + 5u, box[1].z);
    }
}

// ---- 2. o início do quadro ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i < sp.keepBase) { atomicStore(&sp_scratch[i], 0u); }
    if (i < sp.physical) { atomicStore(&sp_scratch[sp.keepBase + i], 0u); }
    // De cada vista: o estado (as dinâmicas, as filas) e os pedidos no referencial do quadro.
    if (i < sp.viewSpan * sp.entries) {
        let ve = sp_split(i, sp.entries);
        let base = sp_vb(ve.x);
        atomicStore(&sp_scratch[base + sp.requestBase + ve.y], 0u);
        if (ve.y < SPV_STATE) { atomicStore(&sp_scratch[base + ve.y], 0u); }
    }
    if (i < sp.groupCount) {
        // A caixa vazia até o kernel da geometria escrever a do quadro.
        let b = sp.boundsBase + i * 6u;
        for (var c = 0u; c < 3u; c++) {
            sp_set_f(b + c, 3.0e38);
            sp_set_f(b + 3u + c, -3.0e38);
        }
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 4u], 0u);
        // A caixa da geometria em aglomerados, vazia (os mínimos no topo, os máximos no fundo da ordem de `sv_order`).
        for (var c = 0u; c < 3u; c++) {
            atomicStore(&sp_scratch[sp.groupBoxBase + i * 6u + c], 0xFFFFFFFFu);
            atomicStore(&sp_scratch[sp.groupBoxBase + i * 6u + 3u + c], 0u);
        }
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 4u + 2u], 0u);
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 4u + 3u], 0u);
    }
    // A contagem da lista dos sprites (as instâncias do desenho deles).
    if (i == 0u) { atomicStore(&sp_args[sp.spriteRecord * 5u + 1u], 0u); }
}

/**
 * O grupo de desenho das instâncias do grupo `base` na vista `v` (a malha que a vista desenha: a dela, na geometria com
 * malha por vista, ou a de sempre); `SP_SKIP` se nenhum a desenha.
 */
fn sp_view_group(base: u32, v: u32) -> u32 {
    var g = base;
    for (var i = 0u; i < SP_GROUP_VARIANTS; i++) {
        let o = g * SP_GROUP_WORDS;
        if (((sp_groups[o + 4u] >> v) & 1u) != 0u) { return g; }
        if ((sp_groups[o + 5u] & SP_GROUP_MORE) == 0u) { break; }
        g++;
    }
    return SP_SKIP;
}

// ---- 3. os retângulos das instâncias ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_instances_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let vj = sp_split(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, sp.instanceCount);
    let v = vj.x;
    let j = vj.y;
    if (v >= sp.viewSpan || !sp_view_live(v) || sp.instanceCount == 0u) { return; }
    let m = sp_view_matrix(v);
    let word = sp_groups[sp.instanceGroupBase + j];
    var rect = vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38);
    var group = SP_SKIP;
    if ((word & SP_SKIP) == 0u) { group = sp_view_group(word & SP_GROUP_MASK, v); }
    if (group != SP_SKIP) {
        let b = sp.boundsBase + group * 6u;
        let lo = vec3f(sp_f(b), sp_f(b + 1u), sp_f(b + 2u));
        let hi = vec3f(sp_f(b + 3u), sp_f(b + 4u), sp_f(b + 5u));
        if (all(lo <= hi)) { rect = sp_box_rect(m, worlds[instances[j].world].world, lo, hi); }
    }
    let r = sp_vb(v) + sp.rectsBase + j * 4u;
    sp_set_f(r, rect.x);
    sp_set_f(r + 1u, rect.y);
    sp_set_f(r + 2u, rect.z);
    sp_set_f(r + 3u, rect.w);
    let series = v * sp.rectStride + j;
    sp_rects_out[series] = rect;
    // O que a instância tocou ao mudar neste quadro (`movedBase`): vazio na parada.
    let w = sp_vb(v) + sp.movedBase + j * 4u;
    sp_set_f(w, 3.0e38);
    sp_set_f(w + 1u, 3.0e38);
    sp_set_f(w + 2u, -3.0e38);
    sp_set_f(w + 3u, -3.0e38);
    if (group == SP_SKIP || sp_view_reset(v, m)) { return; }
    let before = sp_rects_previous[series];
    // A geometria deformada neste quadro suja a instância inteira — salvo a em aglomerados (a lista do grupo, palavra
    // 2), cujos aglomerados que mudaram entram sozinhos (`sp_cluster_bounds_main`).
    let clustered = sp_groups[group * SP_GROUP_WORDS + 2u] != 0u;
    let deforming = (sp_groups[group * SP_GROUP_WORDS + 5u] & SP_GROUP_DEFORMING) != 0u;
    let displaced = any(abs(before - rect) > vec4f(1.0e-5 * (1.0 + abs(rect))));
    if (!displaced && !deforming) { return; }
    // O de antes e o de agora: as páginas onde a instância estava e onde está. Fica também por instância: com a lista
    // das dinâmicas cheia (a malha em aglomerados refeita inteira põe um retângulo por aglomerado), as páginas tocadas
    // são as deste retângulo, não todas as da vista.
    let u = vec4f(min(before.xy, rect.xy), max(before.zw, rect.zw));
    sp_set_f(w, u.x);
    sp_set_f(w + 1u, u.y);
    sp_set_f(w + 2u, u.z);
    sp_set_f(w + 3u, u.w);
    if (!displaced && clustered) { return; }
    sp_push_dynamic(v, u, SP_OVERFLOW_INSTANCES);
}

// ---- 3b. os pedidos no referencial do quadro ----

/** O referencial da vista `v` no quadro anterior (a série `ShadowMatrix`, atraso 1). */
fn sp_view_matrix_previous(v: u32) -> ShadowMatrix {
    return sv_face(sp_matrices_previous[sp_view_slot(v)], sp_view_face(v));
}

/**
 * Os pedidos do quadro anterior (a série dos pedidos, atraso 1) levados ao referencial deste quadro (uma invocação por
 * página virtual do quadro anterior; a seção `requestBase`, uma palavra por página virtual de agora). Com o mesmo
 * referencial, a mesma página. Com a luz em outra direção, a página pedida é um prisma do mundo — o retângulo dela no
 * plano da luz de antes pela faixa de profundidade dos pontos que a pediram: os oito cantos vão ao plano da luz de agora
 * (as duas bases são rotações em volta da origem do mundo) e as páginas do mesmo nível que o retângulo deles toca ficam
 * pedidas (até `SP_REQUEST_SPAN` por eixo; a luz que salta de direção passa disso e o quadro fica com a reserva grossa
 * no frustum). Sem isso, a luz que gira a cada quadro desenharia as páginas que os pontos vistos ocupavam no referencial
 * de antes, não as que ocupam agora.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_requests_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let ve = sp_split(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, sp.entries);
    let v = ve.x;
    let i = ve.y;
    if (v >= sp.viewSpan || !sp_view_live(v)) { return; }
    let m = sp_view_matrix(v);
    let n = m.pagesPerLevel;
    if (sp.requestsValid == 0u || i >= SV_MAX_LEVELS * n * n) { return; }
    let before = sp_view_matrix_previous(v);
    // Os pedidos de antes são os da faixa desta vista só se ela já era a dona (a mesma faixa, o mesmo tamanho).
    if (before.pagesPerLevel != n || before.firstLevelRadius != m.firstLevelRadius
        || before.requestBase != m.requestBase) { return; }
    let wanted = sp_vb(v) + sp.requestBase;
    let k = i / (n * n);
    if (k >= sv_levels(m) || k >= sv_levels(before)) { return; }
    let hi = sp_requests_previous[before.requestBase + i * 2u + 1u];
    if (hi == 0u) { return; }
    let lo = sp_requests_previous[before.requestBase + i * 2u];
    let same = all(before.lightView[0] == m.lightView[0]) && all(before.lightView[1] == m.lightView[1])
        && all(before.lightView[2] == m.lightView[2]) && all(before.lightView[3] == m.lightView[3])
        && all(before.origin == m.origin);
    if (same) {
        atomicStore(&sp_scratch[wanted + i], 1u);
        return;
    }
    let s = vec2u((i % (n * n)) % n, (i % (n * n)) / n);
    let g = vec2f(sp_global(before, k, s));
    let p = sv_page_size(m, k);
    // Luz de antes → mundo → luz de agora.
    let turn = mat3x3f(m.lightView[0].xyz, m.lightView[1].xyz, m.lightView[2].xyz) * rigid_rotation_inverse(before.lightView);
    var rect = vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38);
    for (var c = 0u; c < 8u; c++) {
        let corner = vec3f(
            (g.x + select(0.0, 1.0, (c & 1u) != 0u)) * p,
            (g.y + select(0.0, 1.0, (c & 2u) != 0u)) * p,
            sv_unorder(select(lo, hi, (c & 4u) != 0u)),
        );
        // Na vista em perspectiva (a luz que andou): a vista de antes → mundo → a vista de agora.
        let q = select((turn * corner).xy, sv_light(m, sp_unproject(before, corner)).xy, m.kind == 1u);
        rect = vec4f(min(rect.xy, q), max(rect.zw, q));
    }
    let first = sv_page_of(m, k, rect.xy);
    let last = sv_page_of(m, k, rect.zw);
    for (var dy = 0; dy < SP_REQUEST_SPAN; dy++) {
        for (var dx = 0; dx < SP_REQUEST_SPAN; dx++) {
            let page = first + vec2i(dx, dy);
            if (any(page > last) || !sv_in_window(m, k, page)) { continue; }
            let slot = sv_slot(m, k, page);
            atomicStore(&sp_scratch[wanted + slot.y * n + slot.x], 1u);
        }
    }
}

// ---- 4. a tabela ----

/** A coluna da página (o retângulo pela faixa de profundidade em volta da câmera) toca o frustum da câmera? */
fn sp_in_frustum(m: ShadowMatrix, rect: vec4f) -> bool {
    let vp = m.viewProjection;
    // Sem câmera (a vista-projeção zero): toda a janela.
    if (all(vp[3] == vec4f(0.0)) && all(vp[2] == vec4f(0.0))) { return true; }
    // Mundo ← luz: a transposta da rotação.
    let back = rigid_rotation_inverse(m.lightView);
    let perspective = m.kind == 1u;
    var below = vec4u(0u);
    var above = vec4u(0u);
    for (var c = 0u; c < 8u; c++) {
        let x = select(rect.x, rect.z, (c & 1u) != 0u);
        let y = select(rect.y, rect.w, (c & 2u) != 0u);
        let z = m.camera.z + select(-m.depthRange, m.depthRange, (c & 4u) != 0u);
        // Na vista em perspectiva o canto do tronco da página (do plano próximo ao alcance) volta ao mundo pela origem.
        var corner = back * vec3f(x, y, z);
        if (perspective) { corner = sp_unproject(m, vec3f(x, y, z)); }
        let clip = vp * vec4f(corner, 1.0);
        below += vec4u(vec4<bool>(clip.x < -clip.w, clip.y < -clip.w, clip.z < 0.0, false));
        above += vec4u(vec4<bool>(clip.x > clip.w, clip.y > clip.w, clip.z > clip.w, false));
    }
    return !(any(below.xyz == vec3u(8u)) || any(above.xyz == vec3u(8u)));
}

/**
 * Alguma dinâmica da vista `v` tocou a página? Com a lista cheia, o que não coube responde pelo retângulo da instância
 * que mudou (`SP_OVERFLOW_INSTANCES`: a malha em aglomerados refeita com a câmera põe um retângulo por aglomerado e
 * enche a lista — tocadas são as páginas dela, não as da cena inteira) ou, sem retângulo por instância
 * (`SP_OVERFLOW_ALL`), todas.
 */
fn sp_touched(v: u32, rect: vec4f) -> bool {
    let base = sp_vb(v);
    let overflow = atomicLoad(&sp_scratch[base + SPV_OVERFLOW]);
    if (overflow >= SP_OVERFLOW_ALL) { return true; }
    let n = min(atomicLoad(&sp_scratch[base + SPV_DYNAMIC_COUNT]), sp.dynamicCap);
    for (var d = 0u; d < 65536u; d++) {
        if (d >= n) { break; }
        let o = base + sp.dynamicBase + d * 4u;
        if (sp_overlap(rect, vec4f(sp_f(o), sp_f(o + 1u), sp_f(o + 2u), sp_f(o + 3u)))) { return true; }
    }
    if (overflow == 0u) { return false; }
    if (sp.instanceCount > 65536u) { return true; }
    for (var j = 0u; j < 65536u; j++) {
        if (j >= sp.instanceCount) { break; }
        let o = base + sp.movedBase + j * 4u;
        if (sp_overlap(rect, vec4f(sp_f(o), sp_f(o + 1u), sp_f(o + 2u), sp_f(o + 3u)))) { return true; }
    }
    return false;
}

/**
 * A página virtual `entry` da vista `v` precisa de página física (`SP_NEED_ALLOC`) ou de redesenho na `phys`
 * (`SP_NEED_RENDER`).
 */
fn sp_need(v: u32, entry: u32, need: u32, phys: u32) {
    atomicStore(&sp_scratch[sp_vb(v) + sp.needBase + entry], need | (phys << 2u));
}

/** Página global do texel `s` da janela do nível `k`. */
fn sp_global(m: ShadowMatrix, k: u32, s: vec2u) -> vec2i {
    let n = i32(m.pagesPerLevel);
    let w = sv_window(m, k);
    return w + (((vec2i(s) - w) % vec2i(n)) + vec2i(n)) % vec2i(n);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_update_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let ve = sp_split(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, sp.entries);
    let v = ve.x;
    let i = ve.y;
    if (v >= sp.viewSpan) { return; }
    let section = sp_vb(v);
    atomicStore(&sp_scratch[section + sp.needBase + i], 0u);
    if (!sp_view_live(v)) { return; }
    let m = sp_view_matrix(v);
    let n = m.pagesPerLevel;
    if (i >= SV_MAX_LEVELS * n * n) { return; }
    let k = i / (n * n);
    let s = vec2u((i % (n * n)) % n, (i % (n * n)) / n);
    let texel = vec2u(s.x, s.y + k * n);
    if (k >= sv_levels(m)) {
        sp_table_store(m, texel, vec4u(0u));
        return;
    }
    let g = sp_global(m, k, s);
    let gx = bitcast<u32>(g.x);
    let gy = bitcast<u32>(g.y);
    let reset = sp_view_reset(v, m);
    // A entrada do quadro anterior, no lugar (esta invocação é a única que lê e escreve a entrada).
    let old = select(sp_table_load(m, texel), vec4u(0u), reset);
    let valid = (old.z & SV_ALLOCATED) != 0u && old.x == gx && old.y == gy;
    let rect = sp_page_rect(m, k, g);
    var requested = atomicLoad(&sp_scratch[section + sp.requestBase + i]) != 0u;
    // O nível mais grosso no frustum, sempre: a reserva do que não está numa superfície vista no quadro anterior (os
    // pontos do volume da névoa, o primeiro quadro, um corte, a borda que aparece).
    // Na vista em perspectiva, só as páginas do tronco existem.
    if (k + 1u == sv_levels(m)) { requested = requested || (sp_in_frustum(m, rect) && sv_in_window(m, k, g)); }
    let age = select(min(((old.z >> SV_AGE_SHIFT) & SV_AGE_MASK) + 1u, 255u), 0u, requested);
    if (valid && age <= SP_MAX_AGE) {
        let phys = old.z & SV_PHYS_MASK;
        atomicStore(&sp_scratch[sp.keepBase + phys], 1u);
        // A série do atlas diz se o conteúdo da página ainda vale (carimbada na época atual).
        let stamped = sp_atlas_stamps[phys] == sp_atlas_clock.x;
        let rendered = (old.z & SV_RENDERED) != 0u && stamped && !sp_touched(v, rect);
        sp_table_store(
            m,
            texel,
            vec4u(gx, gy, SV_ALLOCATED | select(0u, SV_RENDERED, rendered) | (age << SV_AGE_SHIFT) | phys, old.w),
        );
        if (!rendered) { sp_need(v, i, SP_NEED_RENDER, phys); }
        return;
    }
    sp_table_store(m, texel, vec4u(gx, gy, 0u, 0u));
    if (requested) { sp_need(v, i, SP_NEED_ALLOC, 0u); }
}

// ---- 4b. as filas por nível, na ordem do índice ----

/**
 * As filas de um nível de uma vista (um grupo de trabalho por vista e nível): as páginas que precisam de página física
 * ou de redesenho, na ordem do índice (a soma de prefixos no grupo) — o que entra no orçamento do quadro não depende da
 * ordem dos atômicos. A vista sem mapa fica com as filas vazias.
 */
@compute @workgroup_size(256)
fn sp_rank_main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let v = wid.x / SV_MAX_LEVELS;
    let k = wid.x % SV_MAX_LEVELS;
    let section = sp_vb(v);
    let n = select(0u, sp_view_matrix(v).pagesPerLevel, sp_view_live(v));
    let per = (n * n + 255u) / 256u;
    let first = k * n * n + lid * per;
    var count = 0u;
    for (var c = 0u; c < SP_RANK_CHUNK; c++) {
        if (c >= per || lid * per + c >= n * n) { break; }
        if ((atomicLoad(&sp_scratch[section + sp.needBase + first + c]) & 3u) != 0u) { count++; }
    }
    pa_rank[lid] = count;
    pa_scan(lid);
    var rank = pa_rank[lid] - count;
    for (var c = 0u; c < SP_RANK_CHUNK; c++) {
        if (c >= per || lid * per + c >= n * n) { break; }
        let i = first + c;
        let need = atomicLoad(&sp_scratch[section + sp.needBase + i]);
        if ((need & 3u) == 0u) { continue; }
        let o = section + sp.workBase + (k * n * n + rank) * 2u;
        atomicStore(&sp_scratch[o], i | select(0u, SP_RERENDER, (need & 3u) == SP_NEED_RENDER));
        atomicStore(&sp_scratch[o + 1u], need >> 2u);
        rank++;
    }
    if (lid == 255u) { atomicStore(&sp_scratch[section + SPV_LEVEL_WORK + k], pa_rank[255]); }
}

// ---- 5. as livres ----

/** As páginas físicas que nenhuma página virtual segura, em ordem (um grupo de trabalho). */
@compute @workgroup_size(256)
fn sp_free_main(@builtin(local_invocation_index) lid: u32) {
    let total = sp.physical;
    let per = (total + 255u) / 256u;
    var count = 0u;
    for (var c = 0u; c < SP_FREE_CHUNK; c++) {
        let p = lid * per + c;
        if (c >= per || p >= total) { break; }
        if (atomicLoad(&sp_scratch[sp.keepBase + p]) == 0u) { count++; }
    }
    pa_rank[lid] = count;
    pa_scan(lid);
    var rank = pa_rank[lid] - count;
    for (var c = 0u; c < SP_FREE_CHUNK; c++) {
        let p = lid * per + c;
        if (c >= per || p >= total) { break; }
        if (atomicLoad(&sp_scratch[sp.keepBase + p]) != 0u) { continue; }
        atomicStore(&sp_scratch[sp.freeBase + rank], p);
        rank++;
    }
    if (lid == 255u) { atomicStore(&sp_scratch[SP_FREE_COUNT], pa_rank[255]); }
}

// ---- 6. a alocação e as sujas ----

// O orçamento de páginas do quadro é um só para todas as vistas (spec 013, R7). A ordem em que as filas são atendidas:
//   1. a reserva grossa (o nível mais grosso) das vistas cujo cache recomeça;
//   2. a reserva grossa das vistas cujo cache segue;
//   3. os níveis seguintes das que recomeçam, do mais grosso ao mais fino;
//   4. os níveis seguintes das que seguem, do mais grosso ao mais fino.
// Em cada passo (um nível a contar do mais grosso de cada vista) as vistas se revezam página a página: nenhuma espera
// outra esvaziar a fila. As páginas das vistas cujo cache segue contam no orçamento (`sp.budget`): o que não entra fica
// para os quadros seguintes, e a imagem lê o que já está desenhado (o nível mais grosso). A vista que recomeça (a luz
// mudou de direção, os grupos mudaram, a faixa mudou de dono) não tem o que ler de antes: entram todas as que pediu,
// até o atlas inteiro, sem gastar o orçamento das outras — a luz que gira a cada quadro (o sol ao longo do dia) recomeça
// a cada quadro, e o que ficasse para depois nunca seria desenhado. As páginas físicas são as livres: nenhuma vista toma
// as que outra segura.

/** As filas de cada vista por passo (0 = o nível mais grosso da vista), lidas uma vez por invocação: `[v · 16 + passo]`. */
var<private> sp_queue: array<u32, 256>;
/** Os níveis ativos de cada vista. */
var<private> sp_queue_levels: array<u32, 16>;

/** Lê as filas das vistas vivas e devolve as vistas cujo cache recomeça neste quadro (um bit por vista). */
fn sp_queues_load() -> u32 {
    var resetting = 0u;
    for (var v = 0u; v < SV_MAX_VIEWS; v++) {
        if (v >= sp.viewSpan) { break; }
        if (!sp_view_live(v)) { continue; }
        let m = sp_view_matrix(v);
        let levels = min(sv_levels(m), SV_MAX_LEVELS);
        sp_queue_levels[v] = levels;
        if (sp_view_reset(v, m)) { resetting |= 1u << v; }
        let section = sp_vb(v);
        for (var step = 0u; step < SV_MAX_LEVELS; step++) {
            if (step >= levels) { break; }
            sp_queue[v * SV_MAX_LEVELS + step] = atomicLoad(&sp_scratch[section + SPV_LEVEL_WORK + levels - 1u - step]);
        }
    }
    return resetting;
}

/** Páginas das vistas de `mask` com fila no passo `step`, cada fila contada até `cap`. */
fn sp_step_count(mask: u32, step: u32, cap: u32) -> u32 {
    var total = 0u;
    for (var v = 0u; v < SV_MAX_VIEWS; v++) {
        if (((mask >> v) & 1u) != 0u) { total += min(sp_queue[v * SV_MAX_LEVELS + step], cap); }
    }
    return total;
}

/**
 * A posição `t` do rodízio das vistas de `mask` no passo `step` (`t` menor que o total do passo): a rodada `r` (cada
 * vista com fila entra uma vez por rodada, na ordem do índice) é a maior com `sp_step_count(…, r) ≤ t`, por bisseção; x
 * = a vista, y = a posição na fila dela (a rodada).
 */
fn sp_step_pick(mask: u32, step: u32, t: u32) -> vec2u {
    var lo = 0u;
    var hi = SP_ROUND_MAX;
    for (var i = 0u; i < SP_ROUND_STEPS; i++) {
        if (lo >= hi) { break; }
        let mid = (lo + hi + 1u) / 2u;
        if (sp_step_count(mask, step, mid) <= t) { lo = mid; } else { hi = mid - 1u; }
    }
    var rest = t - sp_step_count(mask, step, lo);
    for (var v = 0u; v < SV_MAX_VIEWS; v++) {
        if (((mask >> v) & 1u) == 0u || sp_queue[v * SV_MAX_LEVELS + step] <= lo) { continue; }
        if (rest == 0u) { return vec2u(v, lo); }
        rest--;
    }
    return vec2u(SV_MAX_VIEWS, 0u);
}

/**
 * A posição `t0` da ordem das vistas de `mask` nos passos de `first` a `last` (exclusivo): x = a vista (`SV_MAX_VIEWS`
 * se a ordem acabou antes), y = o nível, z = a posição na fila do nível.
 */
fn sp_order_pick(mask: u32, first: u32, last: u32, t0: u32) -> vec3u {
    var t = t0;
    for (var step = first; step < SV_MAX_LEVELS; step++) {
        if (step >= last) { break; }
        let total = sp_step_count(mask, step, SP_ROUND_MAX);
        if (t < total) {
            let pick = sp_step_pick(mask, step, t);
            if (pick.x >= SV_MAX_VIEWS) { break; }
            return vec3u(pick.x, sp_queue_levels[pick.x] - 1u - step, pick.y);
        }
        t -= total;
    }
    return vec3u(SV_MAX_VIEWS, 0u, 0u);
}

/**
 * As filas na ordem acima até o orçamento do quadro (um grupo de trabalho, cada invocação com um trecho seguido das
 * posições na ordem): a página nova recebe a física livre da sua posição entre as novas, e as que entram formam a lista
 * das sujas na mesma ordem — tudo determinístico.
 */
@compute @workgroup_size(256)
fn sp_allocate_main(@builtin(local_invocation_index) lid: u32) {
    let resetting = sp_queues_load();
    let following = sp.liveMask & ~resetting;
    // Os trechos da ordem: a reserva grossa das que recomeçam e das que seguem, e os níveis seguintes das que recomeçam.
    let coarse_reset = sp_step_count(resetting, 0u, SP_ROUND_MAX);
    let coarse_follow = sp_step_count(following, 0u, SP_ROUND_MAX);
    var fine_reset = 0u;
    for (var step = 1u; step < SV_MAX_LEVELS; step++) { fine_reset += sp_step_count(resetting, step, SP_ROUND_MAX); }
    // Posições percorridas: o orçamento enquanto todos os caches seguem; com um recomeço, até o atlas inteiro.
    let all = min(sp.physical, 256u * SP_ALLOCATE_CHUNK);
    let budget = select(min(sp.budget, all), all, resetting != 0u);
    let per = (budget + 255u) / 256u;
    var words: array<u32, SP_ALLOCATE_CHUNK>;
    var physes: array<u32, SP_ALLOCATE_CHUNK>;
    var levels: array<u32, SP_ALLOCATE_CHUNK>;
    var views: array<u32, SP_ALLOCATE_CHUNK>;
    // Por posição do trecho: achada na fila (bit 0), nova (bit 1), entra no quadro (bit 2).
    var states: array<u32, SP_ALLOCATE_CHUNK>;
    var fresh = 0u;
    for (var c = 0u; c < SP_ALLOCATE_CHUNK; c++) {
        states[c] = 0u;
        let t = lid * per + c;
        if (c >= per || t >= budget) { continue; }
        var pick = vec3u(SV_MAX_VIEWS, 0u, 0u);
        if (t < coarse_reset) {
            pick = sp_order_pick(resetting, 0u, 1u, t);
        } else if (t < coarse_reset + coarse_follow) {
            // As das vistas cujo cache segue contam no orçamento.
            if (t - coarse_reset < sp.budget) { pick = sp_order_pick(following, 0u, 1u, t - coarse_reset); }
        } else if (t < coarse_reset + coarse_follow + fine_reset) {
            pick = sp_order_pick(resetting, 1u, SV_MAX_LEVELS, t - coarse_reset - coarse_follow);
        } else {
            let u = t - coarse_reset - coarse_follow - fine_reset;
            if (coarse_follow + u < sp.budget) { pick = sp_order_pick(following, 1u, SV_MAX_LEVELS, u); }
        }
        if (pick.x >= SV_MAX_VIEWS) { continue; }
        let n = sp_view_matrix(pick.x).pagesPerLevel;
        let o = sp_vb(pick.x) + sp.workBase + (pick.y * n * n + pick.z) * 2u;
        words[c] = atomicLoad(&sp_scratch[o]);
        physes[c] = atomicLoad(&sp_scratch[o + 1u]);
        levels[c] = pick.y;
        views[c] = pick.x;
        states[c] = select(1u, 3u, (words[c] & SP_RERENDER) == 0u);
        if ((states[c] & 2u) != 0u) { fresh++; }
    }
    // A posição entre as novas: a física livre dessa posição.
    var a = pa_exclusive(lid, fresh);
    let free = atomicLoad(&sp_scratch[SP_FREE_COUNT]);
    var entering = 0u;
    for (var c = 0u; c < SP_ALLOCATE_CHUNK; c++) {
        if ((states[c] & 1u) == 0u) { continue; }
        if ((states[c] & 2u) != 0u) {
            if (a < free) {
                physes[c] = atomicLoad(&sp_scratch[sp.freeBase + a]);
                states[c] |= 4u;
            }
            a++;
        } else {
            states[c] |= 4u;
        }
        if ((states[c] & 4u) != 0u) { entering++; }
    }
    // A posição entre as que entram: a da lista das sujas.
    var d = pa_exclusive(lid, entering);
    if (lid == 255u) {
        let dirty = pa_rank[255];
        atomicStore(&sp_scratch[SP_DIRTY_COUNT], dirty);
        // Os despachos das etapas seguintes pelo que entrou (sem página suja, nenhum): o fundo, um grupo por página
        // suja; os pares, uma invocação por (página suja, instância), em linhas de até `SP_DISPATCH_ROW` grupos.
        sp_dispatch[0] = dirty;
        sp_dispatch[1] = 1u;
        sp_dispatch[2] = 1u;
        let groups = (dirty * sp.instanceCount + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
        let row = min(groups, SP_DISPATCH_ROW);
        sp_dispatch[4] = row;
        sp_dispatch[5] = (groups + max(row, 1u) - 1u) / max(row, 1u);
        sp_dispatch[6] = 1u;
    }
    for (var c = 0u; c < SP_ALLOCATE_CHUNK; c++) {
        if ((states[c] & 4u) == 0u) { continue; }
        let v = views[c];
        let m = sp_view_matrix(v);
        let n = m.pagesPerLevel;
        let z0 = bitcast<u32>(m.camera.z);
        let k = levels[c];
        let phys = physes[c];
        let i = words[c] & ~SP_RERENDER;
        let s = vec2u((i % (n * n)) % n, (i % (n * n)) / n);
        let g = sp_global(m, k, s);
        sp_table_store(
            m,
            vec2u(s.x, s.y + k * n),
            vec4u(bitcast<u32>(g.x), bitcast<u32>(g.y), SV_ALLOCATED | SV_RENDERED | phys, z0),
        );
        // O carimbo da série do atlas: a página escrita na época atual.
        sp_atlas_stamps[phys] = sp_atlas_clock.x;
        // A página virtual aponta a posição na lista das sujas (os sprites acham as páginas sujas que alcançam por ela).
        atomicStore(&sp_scratch[sp_vb(v) + sp.needBase + i], SP_DIRTY_MARK | d);
        let r = sp.dirtyBase + d * 4u;
        atomicStore(&sp_scratch[r], phys | (k << SP_DIRTY_LEVEL_SHIFT) | (v << SP_DIRTY_VIEW_SHIFT));
        atomicStore(&sp_scratch[r + 1u], bitcast<u32>(g.x));
        atomicStore(&sp_scratch[r + 2u], bitcast<u32>(g.y));
        atomicStore(&sp_scratch[r + 3u], z0);
        d++;
    }
}

// ---- 6b. o fundo das páginas sujas ----

/** Um grupo por posição da lista das sujas: a página física inteira (com a borda) com o fundo (1). */
@compute @workgroup_size(256)
fn sp_fill_main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let d = wid.x;
    if (d >= atomicLoad(&sp_scratch[SP_DIRTY_COUNT])) { return; }
    let phys = atomicLoad(&sp_scratch[sp.dirtyBase + d * 4u]) & SP_DIRTY_PHYS_MASK;
    let first = sp_atlas_word(phys, vec2u(0u));
    for (var t = lid; t < SV_STRIDE * SV_STRIDE; t += 256u) {
        sp_atlas[first + t] = 0x3f800000u;
    }
}

// ---- 7. os pares instância × página suja ----

/** O nível (x) e a vista (y) da página suja de primeira palavra `w`. */
fn sp_dirty_place(w: u32) -> vec2u {
    return vec2u((w >> SP_DIRTY_LEVEL_SHIFT) & SP_DIRTY_FIELD_MASK, (w >> SP_DIRTY_VIEW_SHIFT) & SP_DIRTY_FIELD_MASK);
}

/**
 * O grupo de desenho da instância `j` na vista da página suja `d`, se o retângulo dela no plano dessa vista toca a
 * página; senão, `SP_SKIP`.
 */
fn sp_pair_group(d: u32, j: u32) -> u32 {
    if (d >= atomicLoad(&sp_scratch[SP_DIRTY_COUNT])) { return SP_SKIP; }
    let word = sp_groups[sp.instanceGroupBase + j];
    if ((word & SP_SKIP) != 0u) { return SP_SKIP; }
    let r = sp.dirtyBase + d * 4u;
    let place = sp_dirty_place(atomicLoad(&sp_scratch[r]));
    let group = sp_view_group(word & SP_GROUP_MASK, place.y);
    if (group == SP_SKIP) { return SP_SKIP; }
    let m = sp_view_matrix(place.y);
    let g = vec2i(bitcast<i32>(atomicLoad(&sp_scratch[r + 1u])), bitcast<i32>(atomicLoad(&sp_scratch[r + 2u])));
    let o = sp_vb(place.y) + sp.rectsBase + j * 4u;
    let rect = vec4f(sp_f(o), sp_f(o + 1u), sp_f(o + 2u), sp_f(o + 3u));
    if (!sp_overlap(rect, sp_page_rect(m, place.x, g))) { return SP_SKIP; }
    return group;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_pairs_count_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (sp.instanceCount == 0u) { return; }
    let group = sp_pair_group(i / sp.instanceCount, i % sp.instanceCount);
    if (group == SP_SKIP) { return; }
    atomicAdd(&sp_scratch[sp.groupPairsBase + group * 4u], 1u);
}

/** Os trechos dos grupos na reserva dos pares, em ordem; o que passa da reserva fica para os quadros seguintes. */
@compute @workgroup_size(1)
fn sp_pairs_base_main() {
    let capacity = arrayLength(&sp_pairs);
    var running = 0u;
    for (var g = 0u; g < SP_GROUP_LIMIT; g++) {
        if (g >= sp.groupCount) { break; }
        let o = sp.groupPairsBase + g * 4u;
        let n = min(atomicLoad(&sp_scratch[o]), capacity - running);
        atomicStore(&sp_scratch[o + 1u], running);
        atomicStore(&sp_scratch[o + 3u], n);
        // O grupo em aglomerados conta as instâncias do desenho na lista dele (`sp_clusters_main`).
        let record = sp_groups[g * SP_GROUP_WORDS + 3u];
        atomicStore(&sp_args[record * 5u + 1u], select(n, 0u, sp_groups[g * SP_GROUP_WORDS + 2u] != 0u));
        running += n;
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_pairs_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (sp.instanceCount == 0u) { return; }
    let d = i / sp.instanceCount;
    let j = i % sp.instanceCount;
    let group = sp_pair_group(d, j);
    if (group == SP_SKIP) { return; }
    let o = sp.groupPairsBase + group * 4u;
    let idx = atomicAdd(&sp_scratch[o + 2u], 1u);
    if (idx >= atomicLoad(&sp_scratch[o + 3u])) { return; }
    sp_pairs[atomicLoad(&sp_scratch[o + 1u]) + idx] = j | (d << SP_PAIR_SHIFT);
}

// ---- 8. os aglomerados das malhas grandes ----
// A malha grande (muitos triângulos, poucas instâncias) não vai inteira a cada página suja: os triângulos dela se
// dividem em aglomerados de `SP_CLUSTER_TRIS` (na ordem dos índices), cada um com a caixa dos vértices que usa, e o
// aglomerado só é desenhado nas páginas que a forma da caixa dele, vista da luz, toca — um desenho só por grupo, uma
// instância por par (aglomerado, par instância × página suja) da lista do grupo, com os vértices lidos pelos índices.
// A profundidade vai ao atlas pelo mínimo atômico: a ordem da lista não muda a imagem.

/**
 * Os índices da malha no quadro: a capacidade, ou, na malha cuja contagem vem da GPU (a adaptativa), a do quadro (a
 * palavra `countWord`, copiada do registro indireto da geometria antes das etapas).
 */
fn sp_cluster_index_count() -> u32 {
    if (sp_geometry.countWord == 0u) { return sp_geometry.indexCount; }
    return min(sp_geometry.indexCount, atomicLoad(&sp_scratch[sp_geometry.countWord]));
}

/** A caixa (lo, hi) do aglomerado global `g` na série das caixas. */
fn sp_cluster_box(g: u32) -> array<vec3f, 2> {
    let b = g * 6u;
    return array<vec3f, 2>(
        vec3f(sp_cluster_boxes[b], sp_cluster_boxes[b + 1u], sp_cluster_boxes[b + 2u]),
        vec3f(sp_cluster_boxes[b + 3u], sp_cluster_boxes[b + 4u], sp_cluster_boxes[b + 5u]),
    );
}

/**
 * O retângulo no plano da vista da caixa (lo, hi) do objeto na matriz de mundo `world`; vazio se a caixa é vazia. Na
 * vista em perspectiva (spec 013): a caixa toda antes do plano próximo (atrás da luz) ou além do alcance não projeta
 * (vazio); a que cruza o plano próximo cobre o tronco inteiro (a projeção dos cantos de trás não vale).
 */
fn sp_box_rect(m: ShadowMatrix, world: mat4x4f, lo: vec3f, hi: vec3f) -> vec4f {
    var rect = vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38);
    if (any(lo > hi)) { return rect; }
    var behind = 0u;
    var beyond = 0u;
    for (var c = 0u; c < 8u; c++) {
        let corner = select(lo, hi, vec3<bool>((c & 1u) != 0u, (c & 2u) != 0u, (c & 4u) != 0u));
        let l = sv_light(m, (world * vec4f(corner, 1.0)).xyz);
        if (m.kind == 1u) {
            if (l.z < m.near) {
                behind++;
                continue;
            }
            if (l.z > m.far) { beyond++; }
        }
        rect = vec4f(min(rect.xy, l.xy), max(rect.zw, l.xy));
    }
    if (behind == 8u || beyond == 8u) { return vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38); }
    if (behind != 0u) { return vec4f(-SP_FRUSTUM_REACH, -SP_FRUSTUM_REACH, SP_FRUSTUM_REACH, SP_FRUSTUM_REACH); }
    return rect;
}

/**
 * A caixa de cada aglomerado de uma geometria (uma invocação por aglomerado), dos índices dele; o aglomerado além dos
 * índices do quadro fica com a caixa vazia (fora das listas). As caixas são uma série por páginas (uma página por
 * aglomerado, no espaço do objeto): a carimbada na época atual segue, e só é refeita quando a geometria se deforma
 * neste quadro (o produtor a escreveu), quando o cache recomeça (grupos mudados) ou quando a série foi interrompida.
 * Na deformação, o aglomerado cuja caixa mudou entra nas dinâmicas (a caixa de antes unida à de agora, em cada
 * instância do grupo): só as páginas que ele toca são redesenhadas — a malha reescrita igual (a adaptativa refeita com
 * a câmera, nos retalhos que não mudaram de nível) não suja nada. Sem a caixa de antes (a série interrompida), tudo é
 * tocado.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_cluster_bounds_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let c = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let inside = c < sp_geometry.clusterCount;
    let g = sp_geometry.clusterFirst + c;
    let deforming = (sp_groups[sp_geometry.group * SP_GROUP_WORDS + 5u] & SP_GROUP_DEFORMING) != 0u;
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    if (inside) {
        let stamped = sp_cluster_stamps[g] == sp_cluster_clock.x;
        let old = sp_cluster_box(g);
        lo = old[0];
        hi = old[1];
        if (sp.reset != 0u || deforming || !stamped) {
            sp_cluster_stamps[g] = sp_cluster_clock.x;
            let count = arrayLength(&bounds_vertices) / 8u;
            let first = c * SP_CLUSTER_TRIS * 3u;
            let end = min(first + SP_CLUSTER_TRIS * 3u, sp_cluster_index_count());
            lo = vec3f(3.0e38);
            hi = vec3f(-3.0e38);
            for (var k = 0u; k < SP_CLUSTER_TRIS * 3u; k++) {
                let i = first + k;
                if (i >= end) { break; }
                let v = sp_cluster_indices[i];
                if (v >= count) { continue; }
                let p = vec3f(bounds_vertices[v * 8u], bounds_vertices[v * 8u + 1u], bounds_vertices[v * 8u + 2u]);
                lo = min(lo, p);
                hi = max(hi, p);
            }
            sp_cluster_moved(deforming, stamped, old, lo, hi);
            let b = g * 6u;
            sp_cluster_boxes[b] = lo.x;
            sp_cluster_boxes[b + 1u] = lo.y;
            sp_cluster_boxes[b + 2u] = lo.z;
            sp_cluster_boxes[b + 3u] = hi.x;
            sp_cluster_boxes[b + 4u] = hi.y;
            sp_cluster_boxes[b + 5u] = hi.z;
        }
    }
    // A caixa da geometria: a união das dos aglomerados, no grupo de trabalho e depois entre os grupos (o mínimo e o
    // máximo atômicos sobre a ordem dos bits, `sv_order`); `sp_cluster_box_main` a escreve em `boundsBase`.
    sp_cb_lo[lid] = lo;
    sp_cb_hi[lid] = hi;
    for (var s = WORKGROUP_SIZE / 2u; s > 0u; s >>= 1u) {
        workgroupBarrier();
        if (lid < s) {
            sp_cb_lo[lid] = min(sp_cb_lo[lid], sp_cb_lo[lid + s]);
            sp_cb_hi[lid] = max(sp_cb_hi[lid], sp_cb_hi[lid + s]);
        }
    }
    if (lid != 0u || any(sp_cb_lo[0] > sp_cb_hi[0])) { return; }
    let w = sp.groupBoxBase + sp_geometry.group * 6u;
    for (var a = 0u; a < 3u; a++) {
        atomicMin(&sp_scratch[w + a], sv_order(sp_cb_lo[0][a]));
        atomicMax(&sp_scratch[w + 3u + a], sv_order(sp_cb_hi[0][a]));
    }
}

/**
 * Na deformação, o aglomerado cuja caixa mudou entra nas dinâmicas de cada vista em que o grupo é desenhado (a caixa de
 * antes unida à de agora, em cada instância do grupo, no plano da vista); sem a caixa de antes (a série interrompida),
 * tudo é tocado. Na vista cujo cache recomeça, nada (tudo é refeito).
 */
fn sp_cluster_moved(deforming: bool, stamped: bool, old: array<vec3f, 2>, lo: vec3f, hi: vec3f) {
    if (!deforming || sp.reset != 0u) { return; }
    let empty = any(lo > hi) && any(old[0] > old[1]);
    if (stamped && (empty || (all(old[0] == lo) && all(old[1] == hi)))) { return; }
    let group = sp_geometry.group;
    let mask = sp_groups[group * SP_GROUP_WORDS + 4u];
    let firstInstance = sp_groups[group * SP_GROUP_WORDS];
    let instancesN = min(sp_groups[group * SP_GROUP_WORDS + 1u], SP_CLUSTER_MAX_INSTANCES);
    for (var v = 0u; v < SV_MAX_VIEWS; v++) {
        if (v >= sp.viewSpan) { break; }
        if (((mask >> v) & 1u) == 0u || !sp_view_live(v)) { continue; }
        let m = sp_view_matrix(v);
        if (sp_view_reset(v, m)) { continue; }
        if (!stamped) {
            atomicMax(&sp_scratch[sp_vb(v) + SPV_OVERFLOW], SP_OVERFLOW_ALL);
            continue;
        }
        for (var j = 0u; j < SP_CLUSTER_MAX_INSTANCES; j++) {
            if (j >= instancesN) { break; }
            let world = worlds[instances[firstInstance + j].world].world;
            let a = sp_box_rect(m, world, old[0], old[1]);
            let r = sp_box_rect(m, world, lo, hi);
            sp_push_dynamic(v, vec4f(min(a.xy, r.xy), max(a.zw, r.zw)), SP_OVERFLOW_INSTANCES);
        }
    }
}

var<workgroup> sp_cb_lo: array<vec3f, WORKGROUP_SIZE>;
var<workgroup> sp_cb_hi: array<vec3f, WORKGROUP_SIZE>;

/**
 * A caixa da geometria de um grupo em aglomerados (uma invocação), da união das caixas dos aglomerados (o
 * `sp_cluster_bounds_main` deste quadro) — só os triângulos do quadro, sem varrer o buffer de vértices inteiro (a malha
 * adaptativa tem a capacidade do nível máximo). Sem aglomerado, a caixa fica vazia.
 */
@compute @workgroup_size(1)
fn sp_cluster_box_main() {
    let w = sp.groupBoxBase + sp_geometry.group * 6u;
    // Sem contribuição, o máximo segue no fundo da ordem (0): a caixa fica vazia.
    if (atomicLoad(&sp_scratch[w + 3u]) == 0u) { return; }
    let b = sp.boundsBase + sp_geometry.group * 6u;
    for (var a = 0u; a < 6u; a++) {
        sp_set_f(b + a, sv_unorder(atomicLoad(&sp_scratch[w + a])));
    }
}

/**
 * A caixa de um aglomerado vista da luz: o centro e os três meios eixos da caixa no plano da luz (a projeção da caixa é
 * a soma dos três segmentos, um polígono convexo).
 */
struct SpClusterShape {
    center: vec2f,
    a: vec2f,
    b: vec2f,
    c: vec2f,
}

/** Meia largura da forma ao longo do eixo `n`. */
fn sp_shape_reach(s: SpClusterShape, n: vec2f) -> f32 {
    return abs(dot(n, s.a)) + abs(dot(n, s.b)) + abs(dot(n, s.c));
}

/**
 * A forma toca o retângulo (x0, y0, x1, y1)? Separação pelos eixos do retângulo e pelas normais dos três segmentos
 * (exata para dois convexos no plano): o aglomerado oblíquo à luz não toca as páginas que só a caixa alinhada tocaria.
 */
fn sp_shape_touches(s: SpClusterShape, rect: vec4f) -> bool {
    let half = 0.5 * (rect.zw - rect.xy);
    let d = s.center - 0.5 * (rect.xy + rect.zw);
    let axes = array<vec2f, 5>(vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(-s.a.y, s.a.x), vec2f(-s.b.y, s.b.x),
        vec2f(-s.c.y, s.c.x));
    for (var i = 0u; i < 5u; i++) {
        let n = axes[i];
        if (abs(dot(n, d)) > sp_shape_reach(s, n) + abs(n.x) * half.x + abs(n.y) * half.y) { return false; }
    }
    return true;
}

/**
 * A lista de um grupo em aglomerados (uma invocação por aglomerado, depois dos pares dos grupos): cada par do grupo
 * cuja página suja a forma do aglomerado na instância do par toca entra na lista do grupo (`sp_scratch`, a partir da
 * palavra 2 do grupo em `sp_groups`), e a contagem é a de instâncias do desenho do grupo. A lista tem
 * `SP_CLUSTER_SLOTS` lugares por aglomerado; o que passa não é desenhado (o desenho lê só até o teto).
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_clusters_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let c = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (c >= sp_geometry.clusterCount) { return; }
    let group = sp_geometry.group;
    let list = sp_groups[group * SP_GROUP_WORDS + 2u];
    let record = sp_groups[group * SP_GROUP_WORDS + 3u];
    let mask = sp_groups[group * SP_GROUP_WORDS + 4u];
    let firstInstance = sp_groups[group * SP_GROUP_WORDS];
    let instancesN = min(sp_groups[group * SP_GROUP_WORDS + 1u], SP_CLUSTER_MAX_INSTANCES);
    let cap = sp_geometry.clusterCount * SP_CLUSTER_SLOTS;
    let o = sp.groupPairsBase + group * 4u;
    let n = min(atomicLoad(&sp_scratch[o + 3u]), SP_CLUSTER_PAIR_LIMIT);
    // Sem páginas sujas no grupo, nada a listar.
    if (n == 0u) { return; }
    let box = sp_cluster_box(sp_geometry.clusterFirst + c);
    let lo = box[0];
    let hi = box[1];
    if (any(lo > hi)) { return; }
    let h = 0.5 * (hi - lo);
    let base = atomicLoad(&sp_scratch[o + 1u]);
    // Vista a vista (as em que o grupo é desenhado): a forma do aglomerado no plano dela, em cada instância, contra as
    // páginas sujas dela entre os pares do grupo.
    for (var v = 0u; v < SV_MAX_VIEWS; v++) {
        if (v >= sp.viewSpan) { break; }
        if (((mask >> v) & 1u) == 0u || !sp_view_live(v)) { continue; }
        let m = sp_view_matrix(v);
        // Na vista em perspectiva a projeção da caixa não é a soma de três segmentos: o retângulo dela no plano.
        let perspective = m.kind == 1u;
        var shapes: array<SpClusterShape, SP_CLUSTER_MAX_INSTANCES>;
        var rects: array<vec4f, SP_CLUSTER_MAX_INSTANCES>;
        for (var j = 0u; j < SP_CLUSTER_MAX_INSTANCES; j++) {
            if (j >= instancesN) { break; }
            let world = worlds[instances[firstInstance + j].world].world;
            if (perspective) {
                rects[j] = sp_box_rect(m, world, lo, hi);
                continue;
            }
            let to_light = m.lightView * world;
            shapes[j] = SpClusterShape(
                sv_light(m, (world * vec4f(0.5 * (lo + hi), 1.0)).xyz).xy,
                (to_light * vec4f(h.x, 0.0, 0.0, 0.0)).xy,
                (to_light * vec4f(0.0, h.y, 0.0, 0.0)).xy,
                (to_light * vec4f(0.0, 0.0, h.z, 0.0)).xy,
            );
        }
        for (var p = 0u; p < SP_CLUSTER_PAIR_LIMIT; p++) {
            if (p >= n) { break; }
            let pair = sp_pairs[base + p];
            let local = (pair & SP_PAIR_MASK) - firstInstance;
            if (local >= instancesN) { continue; }
            let w = sp.dirtyBase + (pair >> SP_PAIR_SHIFT) * 4u;
            let place = sp_dirty_place(atomicLoad(&sp_scratch[w]));
            if (place.y != v) { continue; }
            let g = vec2i(bitcast<i32>(atomicLoad(&sp_scratch[w + 1u])), bitcast<i32>(atomicLoad(&sp_scratch[w + 2u])));
            let page = sp_page_rect(m, place.x, g);
            if (perspective) {
                if (!sp_overlap(rects[local], page)) { continue; }
            } else if (!sp_shape_touches(shapes[local], page)) { continue; }
            let idx = atomicAdd(&sp_args[record * 5u + 1u], 1u);
            if (idx < cap) { atomicStore(&sp_scratch[list + idx], (p << SP_CLUSTER_SHIFT) | c); }
        }
    }
}

// ---- 9. os sprites que projetam ----
// Uma fonte de pontos (`ss_source`, região por despacho; os pontos em `ss_points`, ligados ao kernel da fonte): os
// vértices de uma geometria desenhada como sprites (pela matriz de mundo da instância) ou as partículas de um corpo
// (já no mundo). Cada ponto é uma esfera de raio `radius` (o do material): vista da luz, um disco; a profundidade, a da
// face voltada para a luz. O retângulo da fonte no plano da luz (os pontos com o raio) entra na série dos retângulos
// depois das instâncias e, se mudou ou a fonte se move sozinha (`dynamic`), na lista das dinâmicas — as páginas onde ela
// estava e onde está são redesenhadas. Depois das sujas, cada ponto acha, em cada nível, as páginas que o disco alcança
// (com a borda de 1 texel) pela marca da alocação, e cada par entra na lista dos sprites (um desenho só, seis vértices
// por par). A lista tem teto (`sp.spriteCap`): o que passa não é desenhado. Tudo por vista de sombra: o retângulo da
// fonte no plano de cada vista (um grupo de trabalho por vista) e os pares nas páginas sujas de cada uma.

/** O centro do ponto `i` da fonte no mundo. */
fn ss_center(i: u32) -> vec3f {
    let w = (ss_source.first + i) * ss_source.strideWords + ss_source.posOffsetWords;
    let p = vec3f(ss_points[w], ss_points[w + 1u], ss_points[w + 2u]);
    // A fonte sem instância (`NONE`: corpo de partículas) tem as posições já no mundo.
    if (ss_source.instance == NONE) { return p; }
    return (worlds[instances[ss_source.instance].world].world * vec4f(p, 1.0)).xyz;
}

var<workgroup> ss_lo: array<vec2f, 256>;
var<workgroup> ss_hi: array<vec2f, 256>;

/**
 * O retângulo da fonte no plano da luz de uma vista (um grupo de trabalho por vista) e, se mudou ou se move, a dinâmica
 * dela nessa vista.
 */
@compute @workgroup_size(256)
fn ss_rect_main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let v = wid.x;
    let live = v < sp.viewSpan && sp_view_live(v);
    let m = sp_view_matrix(v);
    let count = select(0u, ss_source.count, live);
    let per = (count + 255u) / 256u;
    var lo = vec2f(3.0e38);
    var hi = vec2f(-3.0e38);
    for (var c = 0u; c < SS_RECT_CHUNK; c++) {
        let i = lid * per + c;
        if (c >= per || i >= count) { break; }
        let l = sv_light(m, ss_center(i));
        // Na vista em perspectiva: o ponto antes do plano próximo não projeta, e o raio vai ao plano pela distância.
        if (m.kind == 1u && l.z < m.near) { continue; }
        let reach = select(0.0, ss_source.radius / max(sv_metres(m, l.z), 1.0e-6), m.kind == 1u);
        lo = min(lo, l.xy - vec2f(reach));
        hi = max(hi, l.xy + vec2f(reach));
    }
    ss_lo[lid] = lo;
    ss_hi[lid] = hi;
    for (var s = 128u; s > 0u; s >>= 1u) {
        workgroupBarrier();
        if (lid < s) {
            ss_lo[lid] = min(ss_lo[lid], ss_lo[lid + s]);
            ss_hi[lid] = max(ss_hi[lid], ss_hi[lid + s]);
        }
    }
    if (lid != 0u || !live) { return; }
    // Na vista ortográfica o raio (m) entra aqui; na em perspectiva já entrou por ponto.
    let r = select(ss_source.radius, 0.0, m.kind == 1u);
    var rect = vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38);
    if (all(ss_lo[0] <= ss_hi[0])) { rect = vec4f(ss_lo[0] - vec2f(r), ss_hi[0] + vec2f(r)); }
    let slot = v * sp.rectStride + ss_source.rectSlot;
    sp_rects_out[slot] = rect;
    if (sp_view_reset(v, m)) { return; }
    let before = sp_rects_previous[slot];
    let moved = ss_source.dynamic != 0u || any(abs(before - rect) > vec4f(1.0e-5 * (1.0 + abs(rect))));
    if (!moved) { return; }
    sp_push_dynamic(v, vec4f(min(before.xy, rect.xy), max(before.zw, rect.zw)), SP_OVERFLOW_ALL);
}

/**
 * Os pares (sprite, página suja) de uma fonte (uma invocação por ponto): em cada vista e em cada nível dela, as páginas
 * globais que o quadrado do disco (com a borda de 1 texel) alcança, na janela do nível, marcadas como sujas pela
 * alocação.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn ss_pairs_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= ss_source.count) { return; }
    if (atomicLoad(&sp_scratch[SP_DIRTY_COUNT]) == 0u) { return; }
    let center = ss_center(i);
    for (var v = 0u; v < SV_MAX_VIEWS; v++) {
        if (v >= sp.viewSpan) { break; }
        if (!sp_view_live(v)) { continue; }
        let m = sp_view_matrix(v);
        let l = sv_light(m, center);
        // O raio no plano da vista (na em perspectiva, pela distância; o ponto antes do plano próximo não projeta).
        if (m.kind == 1u && l.z < m.near) { continue; }
        let r = ss_source.radius / max(sv_metres(m, l.z), 1.0e-6);
        let n = m.pagesPerLevel;
        let marks = sp_vb(v) + sp.needBase;
        for (var k = 0u; k < SV_MAX_LEVELS; k++) {
            if (k >= sv_levels(m)) { break; }
            let p = sv_page_size(m, k);
            let reach = vec2f(r + sv_texel(m, k));
            let g0 = vec2i(floor((l.xy - reach) / p));
            let g1 = vec2i(floor((l.xy + reach) / p));
            for (var y = 0; y < SS_PAGE_SPAN; y++) {
                if (g0.y + y > g1.y) { break; }
                for (var x = 0; x < SS_PAGE_SPAN; x++) {
                    if (g0.x + x > g1.x) { break; }
                    let g = g0 + vec2i(x, y);
                    if (!sv_in_window(m, k, g)) { continue; }
                    let s = sv_slot(m, k, g);
                    let mark = atomicLoad(&sp_scratch[marks + s.y * n + s.x]);
                    if ((mark & SP_DIRTY_MARK) == 0u) { continue; }
                    let idx = atomicAdd(&sp_args[sp.spriteRecord * 5u + 1u], 1u);
                    if (idx >= sp.spriteCap) { return; }
                    let e = idx * SS_ENTRY_WORDS;
                    ss_list[e] = bitcast<u32>(l.x);
                    ss_list[e + 1u] = bitcast<u32>(l.y);
                    ss_list[e + 2u] = bitcast<u32>(l.z);
                    ss_list[e + 3u] = bitcast<u32>(r);
                    ss_list[e + 4u] = mark & ~SP_DIRTY_MARK;
                }
            }
        }
    }
}
