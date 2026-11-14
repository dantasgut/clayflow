// Páginas do mapa de sombra virtual (spec 034, T060), no estágio de sombra, antes do desenho:
//   1. `sp_bounds_main` (um despacho por geometria): a caixa dos vértices da geometria do grupo, no espaço do objeto;
//   2. `sp_clear_main`: os contadores do quadro, as páginas físicas em uso e as instâncias dos desenhos zerados;
//   3. `sp_instances_main` (uma invocação por instância): o retângulo da instância no plano da luz (a caixa pela matriz
//      de mundo); a instância que se moveu ou se deformou desde o quadro anterior (a série dos retângulos, atraso 1)
//      entra na lista das dinâmicas com o retângulo de antes e o de agora;
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
//      `sp_fill_main` (um grupo por posição da lista) preenche as sujas com o fundo;
//   7. os pares instância × página suja (a instância cujo retângulo toca a página): `sp_pairs_count_main` conta os de
//      cada grupo, `sp_pairs_base_main` reparte a reserva dos pares (`sp_pairs`, de tamanho fixo) entre os grupos em
//      ordem e escreve a contagem de instâncias de cada desenho indireto, `sp_pairs_main` escreve cada par no trecho do
//      seu grupo;
//   8. as malhas grandes em aglomerados: `sp_cluster_bounds_main` (um despacho por geometria) dá a caixa de cada
//      aglomerado, e `sp_clusters_main` (um despacho por grupo) monta a lista dos pares (aglomerado, página suja);
//   9. os sprites que projetam (esferas impostoras, um despacho por fonte de pontos): `ss_rect_main`, antes da tabela,
//      dá o retângulo da fonte no plano da luz e a põe entre as dinâmicas; `ss_pairs_main`, depois das sujas, monta a
//      lista (sprite, página suja) pelas páginas que o disco de cada um alcança em cada nível.
// O espaço de trabalho do quadro é um buffer só de palavras (`sp_scratch`), em seções; os contadores no início.
// Laços com teto constante.
// Requer: shadow_virtual, shadow_pages_constants, page_alloc (a soma de prefixos do grupo), vertex_bounds (a caixa dos
// vértices), WORKGROUP_SIZE e os recursos
// de cada entrada.

fn sp_f(i: u32) -> f32 {
    return bitcast<f32>(atomicLoad(&sp_scratch[i]));
}

fn sp_set_f(i: u32, v: f32) {
    atomicStore(&sp_scratch[i], bitcast<u32>(v));
}

/** A entrada `slot` (de `sv_slot`) da tabela, no começo do atlas. */
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
    let physical = sp_atlas_pages_total();
    if (i < physical) { atomicStore(&sp_scratch[sp.keepBase + i], 0u); }
    if (i < sp.groupCount) {
        // A caixa vazia até o kernel da geometria escrever a do quadro.
        let b = sp.boundsBase + i * 6u;
        for (var c = 0u; c < 3u; c++) {
            sp_set_f(b + c, 3.0e38);
            sp_set_f(b + 3u + c, -3.0e38);
        }
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 4u], 0u);
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 4u + 2u], 0u);
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 4u + 3u], 0u);
    }
    // A contagem da lista dos sprites (as instâncias do desenho deles).
    if (i == 0u) { atomicStore(&sp_args[sp.spriteRecord * 5u + 1u], 0u); }
}

fn sp_atlas_pages_total() -> u32 {
    let a = shadow_matrices[sp.casterSlot].atlasPages;
    return a * a;
}

// ---- 3. os retângulos das instâncias ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_instances_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= sp.instanceCount) { return; }
    let m = shadow_matrices[sp.casterSlot];
    let word = sp_groups[sp.instanceGroupBase + j];
    var rect = vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38);
    if ((word & SP_SKIP) == 0u) {
        let b = sp.boundsBase + (word & SP_GROUP_MASK) * 6u;
        let lo = vec3f(sp_f(b), sp_f(b + 1u), sp_f(b + 2u));
        let hi = vec3f(sp_f(b + 3u), sp_f(b + 4u), sp_f(b + 5u));
        if (all(lo <= hi)) {
            let world = worlds[instances[j].world].world;
            for (var c = 0u; c < 8u; c++) {
                let corner = select(lo, hi, vec3<bool>((c & 1u) != 0u, (c & 2u) != 0u, (c & 4u) != 0u));
                let q = sv_light(m, (world * vec4f(corner, 1.0)).xyz).xy;
                rect = vec4f(min(rect.xy, q), max(rect.zw, q));
            }
        }
    }
    let r = sp.rectsBase + j * 4u;
    sp_set_f(r, rect.x);
    sp_set_f(r + 1u, rect.y);
    sp_set_f(r + 2u, rect.z);
    sp_set_f(r + 3u, rect.w);
    sp_rects_out[j] = rect;
    if (sp.reset != 0u || m.direction.w != 0.0) { return; }
    let before = sp_rects_previous[j];
    let moved = any(abs(before - rect) > vec4f(1.0e-5 * (1.0 + abs(rect))))
        || (word & SP_DEFORMING) != 0u;
    if (!moved) { return; }
    let d = atomicAdd(&sp_scratch[SP_DYNAMIC_COUNT], 1u);
    if (d >= sp.dynamicCap) {
        atomicStore(&sp_scratch[SP_OVERFLOW], 1u);
        return;
    }
    // O de antes e o de agora: as páginas onde a instância estava e onde está.
    let u = vec4f(min(before.xy, rect.xy), max(before.zw, rect.zw));
    let o = sp.dynamicBase + d * 4u;
    sp_set_f(o, u.x);
    sp_set_f(o + 1u, u.y);
    sp_set_f(o + 2u, u.z);
    sp_set_f(o + 3u, u.w);
}

// ---- 4. a tabela ----

/** A coluna da página (o retângulo pela faixa de profundidade em volta da câmera) toca o frustum da câmera? */
fn sp_in_frustum(m: ShadowMatrix, rect: vec4f) -> bool {
    let vp = m.viewProjection;
    // Sem câmera (a vista-projeção zero): toda a janela.
    if (all(vp[3] == vec4f(0.0)) && all(vp[2] == vec4f(0.0))) { return true; }
    // Mundo ← luz: a transposta da rotação.
    let back = rigid_rotation_inverse(m.lightView);
    var below = vec4u(0u);
    var above = vec4u(0u);
    for (var c = 0u; c < 8u; c++) {
        let x = select(rect.x, rect.z, (c & 1u) != 0u);
        let y = select(rect.y, rect.w, (c & 2u) != 0u);
        let z = m.camera.z + select(-m.depthRange, m.depthRange, (c & 4u) != 0u);
        let clip = vp * vec4f(back * vec3f(x, y, z), 1.0);
        below += vec4u(vec4<bool>(clip.x < -clip.w, clip.y < -clip.w, clip.z < 0.0, false));
        above += vec4u(vec4<bool>(clip.x > clip.w, clip.y > clip.w, clip.z > clip.w, false));
    }
    return !(any(below.xyz == vec3u(8u)) || any(above.xyz == vec3u(8u)));
}

/** Alguma dinâmica tocou a página (ou a lista transbordou)? */
fn sp_touched(rect: vec4f) -> bool {
    if (atomicLoad(&sp_scratch[SP_OVERFLOW]) != 0u) { return true; }
    let n = min(atomicLoad(&sp_scratch[SP_DYNAMIC_COUNT]), sp.dynamicCap);
    for (var d = 0u; d < 65536u; d++) {
        if (d >= n) { break; }
        let o = sp.dynamicBase + d * 4u;
        if (sp_overlap(rect, vec4f(sp_f(o), sp_f(o + 1u), sp_f(o + 2u), sp_f(o + 3u)))) { return true; }
    }
    return false;
}

/** A página virtual `entry` precisa de página física (`SP_NEED_ALLOC`) ou de redesenho na `phys` (`SP_NEED_RENDER`). */
fn sp_need(entry: u32, need: u32, phys: u32) {
    atomicStore(&sp_scratch[sp.needBase + entry], need | (phys << 2u));
}

/** Página global do texel `s` da janela do nível `k`. */
fn sp_global(m: ShadowMatrix, k: u32, s: vec2u) -> vec2i {
    let n = i32(m.pagesPerLevel);
    let w = sv_window(m, k);
    return w + (((vec2i(s) - w) % vec2i(n)) + vec2i(n)) % vec2i(n);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_update_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let m = shadow_matrices[sp.casterSlot];
    let n = m.pagesPerLevel;
    if (i >= SV_MAX_LEVELS * n * n) { return; }
    let k = i / (n * n);
    let s = vec2u((i % (n * n)) % n, (i % (n * n)) / n);
    let texel = vec2u(s.x, s.y + k * n);
    atomicStore(&sp_scratch[sp.needBase + i], 0u);
    if (k >= sv_levels(m)) {
        sp_table_store(m, texel, vec4u(0u));
        return;
    }
    let g = sp_global(m, k, s);
    let gx = bitcast<u32>(g.x);
    let gy = bitcast<u32>(g.y);
    let reset = sp.reset != 0u || m.direction.w != 0.0;
    // A entrada do quadro anterior, no lugar (esta invocação é a única que lê e escreve a entrada).
    let old = select(sp_table_load(m, texel), vec4u(0u), reset);
    let valid = (old.z & SV_ALLOCATED) != 0u && old.x == gx && old.y == gy;
    let rect = sp_page_rect(m, k, g);
    var requested = sp.requestsValid != 0u && sp_requests_previous[sv_request_word(m, texel)] != 0u;
    // O nível mais grosso no frustum, sempre: a reserva do que não está numa superfície vista no quadro anterior (os
    // pontos do volume da névoa, o primeiro quadro, um corte, a borda que aparece).
    if (k + 1u == sv_levels(m)) { requested = requested || sp_in_frustum(m, rect); }
    let age = select(min(((old.z >> SV_AGE_SHIFT) & SV_AGE_MASK) + 1u, 255u), 0u, requested);
    if (valid && age <= SP_MAX_AGE) {
        let phys = old.z & SV_PHYS_MASK;
        atomicStore(&sp_scratch[sp.keepBase + phys], 1u);
        // A série do atlas diz se o conteúdo da página ainda vale (carimbada na época atual).
        let stamped = sp_atlas_stamps[phys] == sp_atlas_clock.x;
        let rendered = (old.z & SV_RENDERED) != 0u && stamped && !sp_touched(rect);
        sp_table_store(
            m,
            texel,
            vec4u(gx, gy, SV_ALLOCATED | select(0u, SV_RENDERED, rendered) | (age << SV_AGE_SHIFT) | phys, old.w),
        );
        if (!rendered) { sp_need(i, SP_NEED_RENDER, phys); }
        return;
    }
    sp_table_store(m, texel, vec4u(gx, gy, 0u, 0u));
    if (requested) { sp_need(i, SP_NEED_ALLOC, 0u); }
}

// ---- 4b. as filas por nível, na ordem do índice ----

/**
 * As filas de um nível (um grupo de trabalho por nível): as páginas que precisam de página física ou de redesenho, na
 * ordem do índice (a soma de prefixos no grupo) — o que entra no orçamento do quadro não depende da ordem dos atômicos.
 */
@compute @workgroup_size(256)
fn sp_rank_main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let k = wid.x;
    let n = shadow_matrices[sp.casterSlot].pagesPerLevel;
    let per = (n * n + 255u) / 256u;
    let first = k * n * n + lid * per;
    var count = 0u;
    for (var c = 0u; c < SP_RANK_CHUNK; c++) {
        if (c >= per || lid * per + c >= n * n) { break; }
        if ((atomicLoad(&sp_scratch[sp.needBase + first + c]) & 3u) != 0u) { count++; }
    }
    pa_rank[lid] = count;
    pa_scan(lid);
    var rank = pa_rank[lid] - count;
    for (var c = 0u; c < SP_RANK_CHUNK; c++) {
        if (c >= per || lid * per + c >= n * n) { break; }
        let i = first + c;
        let need = atomicLoad(&sp_scratch[sp.needBase + i]);
        if ((need & 3u) == 0u) { continue; }
        let o = sp.workBase + (k * n * n + rank) * 2u;
        atomicStore(&sp_scratch[o], i | select(0u, SP_RERENDER, (need & 3u) == SP_NEED_RENDER));
        atomicStore(&sp_scratch[o + 1u], need >> 2u);
        rank++;
    }
    if (lid == 255u) { atomicStore(&sp_scratch[SP_LEVEL_WORK + k], pa_rank[255]); }
}

// ---- 5. as livres ----

/** As páginas físicas que nenhuma página virtual segura, em ordem (um grupo de trabalho). */
@compute @workgroup_size(256)
fn sp_free_main(@builtin(local_invocation_index) lid: u32) {
    let total = sp_atlas_pages_total();
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

/**
 * As filas na ordem do mais grosso ao mais fino até o orçamento (um grupo de trabalho; a invocação `lid` é a posição
 * na ordem): a página nova recebe a física livre da sua posição entre as novas, e as que entram formam a lista das sujas
 * na mesma ordem — tudo determinístico.
 */
@compute @workgroup_size(256)
fn sp_allocate_main(@builtin(local_invocation_index) lid: u32) {
    let m = shadow_matrices[sp.casterSlot];
    let n = m.pagesPerLevel;
    var t = lid;
    var k = 0u;
    var found = lid < sp.budget;
    if (found) {
        found = false;
        for (var step = 0u; step < SV_MAX_LEVELS; step++) {
            if (step >= sv_levels(m)) { break; }
            let level = sv_levels(m) - 1u - step;
            let c = atomicLoad(&sp_scratch[SP_LEVEL_WORK + level]);
            if (t < c) {
                k = level;
                found = true;
                break;
            }
            t -= c;
        }
    }
    var word = 0u;
    var phys = 0u;
    if (found) {
        let o = sp.workBase + (k * n * n + t) * 2u;
        word = atomicLoad(&sp_scratch[o]);
        phys = atomicLoad(&sp_scratch[o + 1u]);
    }
    let fresh = found && (word & SP_RERENDER) == 0u;
    // A posição entre as novas: a física livre dessa posição.
    pa_rank[lid] = select(0u, 1u, fresh);
    pa_scan(lid);
    let a = pa_rank[lid] - select(0u, 1u, fresh);
    let ok = found && (!fresh || a < atomicLoad(&sp_scratch[SP_FREE_COUNT]));
    if (fresh && ok) { phys = atomicLoad(&sp_scratch[sp.freeBase + a]); }
    // A posição entre as que entram: a da lista das sujas.
    workgroupBarrier();
    pa_rank[lid] = select(0u, 1u, ok);
    pa_scan(lid);
    let d = pa_rank[lid] - select(0u, 1u, ok);
    if (lid == 255u) {
        atomicStore(&sp_scratch[SP_DIRTY_COUNT], pa_rank[255]);
    }
    if (!ok) { return; }
    let i = word & ~SP_RERENDER;
    let s = vec2u((i % (n * n)) % n, (i % (n * n)) / n);
    let g = sp_global(m, k, s);
    let z0 = bitcast<u32>(m.camera.z);
    sp_table_store(
        m,
        vec2u(s.x, s.y + k * n),
        vec4u(bitcast<u32>(g.x), bitcast<u32>(g.y), SV_ALLOCATED | SV_RENDERED | phys, z0),
    );
    // O carimbo da série do atlas: a página escrita na época atual.
    sp_atlas_stamps[phys] = sp_atlas_clock.x;
    // A página virtual aponta a posição na lista das sujas (os sprites acham as páginas sujas que alcançam por ela).
    atomicStore(&sp_scratch[sp.needBase + i], SP_DIRTY_MARK | d);
    let r = sp.dirtyBase + d * 4u;
    atomicStore(&sp_scratch[r], phys | (k << 16u));
    atomicStore(&sp_scratch[r + 1u], bitcast<u32>(g.x));
    atomicStore(&sp_scratch[r + 2u], bitcast<u32>(g.y));
    atomicStore(&sp_scratch[r + 3u], z0);
}

// ---- 6b. o fundo das páginas sujas ----

/** Um grupo por posição da lista das sujas: a página física inteira (com a borda) com o fundo (1). */
@compute @workgroup_size(256)
fn sp_fill_main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
    let d = wid.x;
    if (d >= sp.budget || d >= atomicLoad(&sp_scratch[SP_DIRTY_COUNT])) { return; }
    let m = shadow_matrices[sp.casterSlot];
    let phys = atomicLoad(&sp_scratch[sp.dirtyBase + d * 4u]) & 0xFFFFu;
    let first = sv_page_word(m, phys, vec2u(0u));
    for (var t = lid; t < SV_STRIDE * SV_STRIDE; t += 256u) {
        sp_atlas[first + t] = 0x3f800000u;
    }
}

// ---- 7. os pares instância × página suja ----

/** O grupo da instância `j` se o retângulo dela toca a página suja `d`; senão, `SP_SKIP`. */
fn sp_pair_group(d: u32, j: u32) -> u32 {
    if (d >= sp.budget || d >= atomicLoad(&sp_scratch[SP_DIRTY_COUNT])) { return SP_SKIP; }
    let word = sp_groups[sp.instanceGroupBase + j];
    if ((word & SP_SKIP) != 0u) { return SP_SKIP; }
    let m = shadow_matrices[sp.casterSlot];
    let r = sp.dirtyBase + d * 4u;
    let k = atomicLoad(&sp_scratch[r]) >> 16u;
    let g = vec2i(bitcast<i32>(atomicLoad(&sp_scratch[r + 1u])), bitcast<i32>(atomicLoad(&sp_scratch[r + 2u])));
    let o = sp.rectsBase + j * 4u;
    let rect = vec4f(sp_f(o), sp_f(o + 1u), sp_f(o + 2u), sp_f(o + 3u));
    if (!sp_overlap(rect, sp_page_rect(m, k, g))) { return SP_SKIP; }
    return word & SP_GROUP_MASK;
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
        atomicStore(&sp_args[sp_groups[g * 4u + 3u] * 5u + 1u], select(n, 0u, sp_groups[g * 4u + 2u] != 0u));
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

/** A caixa de cada aglomerado de uma geometria (uma invocação por aglomerado), dos índices dele. */
@compute @workgroup_size(WORKGROUP_SIZE)
fn sp_cluster_bounds_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let c = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (c >= sp_geometry.clusterCount) { return; }
    let count = arrayLength(&bounds_vertices) / 8u;
    let first = c * SP_CLUSTER_TRIS * 3u;
    let end = min(first + SP_CLUSTER_TRIS * 3u, sp_geometry.indexCount);
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    for (var k = 0u; k < SP_CLUSTER_TRIS * 3u; k++) {
        let i = first + k;
        if (i >= end) { break; }
        let v = sp_cluster_indices[i];
        if (v >= count) { continue; }
        let p = vec3f(bounds_vertices[v * 8u], bounds_vertices[v * 8u + 1u], bounds_vertices[v * 8u + 2u]);
        lo = min(lo, p);
        hi = max(hi, p);
    }
    let b = sp.clusterBoundsBase + (sp_geometry.clusterFirst + c) * 6u;
    sp_set_f(b, lo.x);
    sp_set_f(b + 1u, lo.y);
    sp_set_f(b + 2u, lo.z);
    sp_set_f(b + 3u, hi.x);
    sp_set_f(b + 4u, hi.y);
    sp_set_f(b + 5u, hi.z);
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
    let list = sp_groups[group * 4u + 2u];
    let record = sp_groups[group * 4u + 3u];
    let firstInstance = sp_groups[group * 4u];
    let instancesN = min(sp_groups[group * 4u + 1u], SP_CLUSTER_MAX_INSTANCES);
    let cap = sp_geometry.clusterCount * SP_CLUSTER_SLOTS;
    let m = shadow_matrices[sp.casterSlot];
    let b = sp.clusterBoundsBase + (sp_geometry.clusterFirst + c) * 6u;
    let lo = vec3f(sp_f(b), sp_f(b + 1u), sp_f(b + 2u));
    let hi = vec3f(sp_f(b + 3u), sp_f(b + 4u), sp_f(b + 5u));
    if (any(lo > hi)) { return; }
    let h = 0.5 * (hi - lo);
    var shapes: array<SpClusterShape, SP_CLUSTER_MAX_INSTANCES>;
    for (var j = 0u; j < SP_CLUSTER_MAX_INSTANCES; j++) {
        if (j >= instancesN) { break; }
        let world = worlds[instances[firstInstance + j].world].world;
        let to_light = m.lightView * world;
        shapes[j] = SpClusterShape(
            sv_light(m, (world * vec4f(0.5 * (lo + hi), 1.0)).xyz).xy,
            (to_light * vec4f(h.x, 0.0, 0.0, 0.0)).xy,
            (to_light * vec4f(0.0, h.y, 0.0, 0.0)).xy,
            (to_light * vec4f(0.0, 0.0, h.z, 0.0)).xy,
        );
    }
    let o = sp.groupPairsBase + group * 4u;
    let base = atomicLoad(&sp_scratch[o + 1u]);
    let n = min(atomicLoad(&sp_scratch[o + 3u]), SP_CLUSTER_PAIR_LIMIT);
    for (var p = 0u; p < SP_CLUSTER_PAIR_LIMIT; p++) {
        if (p >= n) { break; }
        let pair = sp_pairs[base + p];
        let local = (pair & SP_PAIR_MASK) - firstInstance;
        if (local >= instancesN) { continue; }
        let w = sp.dirtyBase + (pair >> SP_PAIR_SHIFT) * 4u;
        let k = atomicLoad(&sp_scratch[w]) >> 16u;
        let g = vec2i(bitcast<i32>(atomicLoad(&sp_scratch[w + 1u])), bitcast<i32>(atomicLoad(&sp_scratch[w + 2u])));
        if (!sp_shape_touches(shapes[local], sp_page_rect(m, k, g))) { continue; }
        let idx = atomicAdd(&sp_args[record * 5u + 1u], 1u);
        if (idx < cap) { atomicStore(&sp_scratch[list + idx], (p << SP_CLUSTER_SHIFT) | c); }
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
// por par). A lista tem teto (`sp.spriteCap`): o que passa não é desenhado.

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

/** O retângulo da fonte no plano da luz (um grupo de trabalho por fonte) e, se mudou ou se move, a dinâmica dela. */
@compute @workgroup_size(256)
fn ss_rect_main(@builtin(local_invocation_index) lid: u32) {
    let m = shadow_matrices[sp.casterSlot];
    let count = ss_source.count;
    let per = (count + 255u) / 256u;
    var lo = vec2f(3.0e38);
    var hi = vec2f(-3.0e38);
    for (var c = 0u; c < SS_RECT_CHUNK; c++) {
        let i = lid * per + c;
        if (c >= per || i >= count) { break; }
        let q = sv_light(m, ss_center(i)).xy;
        lo = min(lo, q);
        hi = max(hi, q);
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
    if (lid != 0u) { return; }
    let r = ss_source.radius;
    var rect = vec4f(3.0e38, 3.0e38, -3.0e38, -3.0e38);
    if (all(ss_lo[0] <= ss_hi[0])) { rect = vec4f(ss_lo[0] - vec2f(r), ss_hi[0] + vec2f(r)); }
    let slot = ss_source.rectSlot;
    sp_rects_out[slot] = rect;
    if (sp.reset != 0u || m.direction.w != 0.0) { return; }
    let before = sp_rects_previous[slot];
    let moved = ss_source.dynamic != 0u || any(abs(before - rect) > vec4f(1.0e-5 * (1.0 + abs(rect))));
    if (!moved) { return; }
    let d = atomicAdd(&sp_scratch[SP_DYNAMIC_COUNT], 1u);
    if (d >= sp.dynamicCap) {
        atomicStore(&sp_scratch[SP_OVERFLOW], 1u);
        return;
    }
    let u = vec4f(min(before.xy, rect.xy), max(before.zw, rect.zw));
    let o = sp.dynamicBase + d * 4u;
    sp_set_f(o, u.x);
    sp_set_f(o + 1u, u.y);
    sp_set_f(o + 2u, u.z);
    sp_set_f(o + 3u, u.w);
}

/**
 * Os pares (sprite, página suja) de uma fonte (uma invocação por ponto): em cada nível, as páginas globais que o
 * quadrado do disco (com a borda de 1 texel) alcança, na janela do nível, marcadas como sujas pela alocação.
 */
@compute @workgroup_size(WORKGROUP_SIZE)
fn ss_pairs_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= ss_source.count) { return; }
    if (min(atomicLoad(&sp_scratch[SP_DIRTY_COUNT]), sp.budget) == 0u) { return; }
    let m = shadow_matrices[sp.casterSlot];
    let l = sv_light(m, ss_center(i));
    let r = ss_source.radius;
    let n = m.pagesPerLevel;
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
                let mark = atomicLoad(&sp_scratch[sp.needBase + s.y * n + s.x]);
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
