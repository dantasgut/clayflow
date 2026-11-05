// Páginas do mapa de sombra virtual (spec 034, T060), no estágio de sombra, antes do desenho:
//   1. `sp_bounds_main` (um despacho por geometria): a caixa dos vértices da geometria do grupo, no espaço do objeto;
//   2. `sp_clear_main`: os contadores do quadro, as páginas físicas em uso e as instâncias dos desenhos zerados;
//   3. `sp_instances_main` (uma invocação por instância): o retângulo da instância no plano da luz (a caixa pela matriz
//      de mundo); a instância que se moveu ou se deformou desde o quadro anterior (a série dos retângulos, atraso 1)
//      entra na lista das dinâmicas com o retângulo de antes e o de agora;
//   4. `sp_update_main` (uma por página virtual): a página do quadro anterior (a série da tabela) segue quando ainda é a
//      mesma página global, foi pedida há poucos quadros e nenhuma dinâmica a tocou — e entra na lista do transporte
//      (o desenho a copia do atlas anterior, atraso 1, para o de agora); a pedida (os pedidos do quadro anterior, a
//      série dos pedidos) sem página física precisa de alocação; a tocada, de redesenho — e `sp_rank_main` monta as filas
//      de cada nível na ordem do índice;
//   5. `sp_free_main` (um grupo): as páginas físicas que nenhuma página virtual segura, em ordem;
//   6. `sp_allocate_main` (um grupo): as filas por nível, do mais grosso ao mais fino (a reserva grossa primeiro), até o
//      orçamento do quadro — a página nova recebe uma física livre — e a lista das sujas a desenhar. As filas, as livres
//      e a alocação saem em ordem (somas de prefixos no grupo): a imagem não depende da ordem dos atômicos;
//   7. os pares instância × página suja (a instância cujo retângulo toca a página): `sp_pairs_count_main` conta os de
//      cada grupo, `sp_pairs_base_main` reparte a reserva dos pares (`sp_pairs`, de tamanho fixo) entre os grupos em
//      ordem e escreve a contagem de instâncias de cada desenho indireto, `sp_pairs_main` escreve cada par no trecho do
//      seu grupo.
// O espaço de trabalho do quadro é um buffer só de palavras (`sp_scratch`), em seções; os contadores no início.
// Laços com teto constante.
// Requer: shadow_virtual, shadow_pages_constants, WORKGROUP_SIZE e os recursos de cada entrada.

fn sp_f(i: u32) -> f32 {
    return bitcast<f32>(atomicLoad(&sp_scratch[i]));
}

fn sp_set_f(i: u32, v: f32) {
    atomicStore(&sp_scratch[i], bitcast<u32>(v));
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

var<workgroup> sp_lo: array<vec3f, 256>;
var<workgroup> sp_hi: array<vec3f, 256>;

@compute @workgroup_size(256)
fn sp_bounds_main(@builtin(local_invocation_index) lid: u32) {
    let count = arrayLength(&sp_vertices) / 8u;
    var lo = vec3f(3.0e38);
    var hi = vec3f(-3.0e38);
    for (var r = 0u; r < SP_BOUNDS_ROUNDS; r++) {
        let v = lid + r * 256u;
        if (v >= count) { break; }
        let p = vec3f(sp_vertices[v * 8u], sp_vertices[v * 8u + 1u], sp_vertices[v * 8u + 2u]);
        lo = min(lo, p);
        hi = max(hi, p);
    }
    sp_lo[lid] = lo;
    sp_hi[lid] = hi;
    workgroupBarrier();
    for (var s = 128u; s > 0u; s = s >> 1u) {
        if (lid < s) {
            sp_lo[lid] = min(sp_lo[lid], sp_lo[lid + s]);
            sp_hi[lid] = max(sp_hi[lid], sp_hi[lid + s]);
        }
        workgroupBarrier();
    }
    if (lid == 0u) {
        let b = sp.boundsBase + sp_geometry.group * 6u;
        sp_set_f(b, sp_lo[0].x);
        sp_set_f(b + 1u, sp_lo[0].y);
        sp_set_f(b + 2u, sp_lo[0].z);
        sp_set_f(b + 3u, sp_hi[0].x);
        sp_set_f(b + 4u, sp_hi[0].y);
        sp_set_f(b + 5u, sp_hi[0].z);
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
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 3u], 0u);
        atomicStore(&sp_scratch[sp.groupPairsBase + i * 3u + 2u], 0u);
    }
    if (i == 0u) {
        atomicStore(&sp_args[sp.clearRecord * 5u + 1u], 0u);
        atomicStore(&sp_args[(sp.clearRecord + 1u) * 5u + 1u], 0u);
    }
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
    let texel = vec2u(j % sp.rectsWidth, j / sp.rectsWidth);
    textureStore(sp_rects_out, texel, rect);
    if (sp.reset != 0u || m.direction.w != 0.0) { return; }
    let before = textureLoad(sp_rects_previous, texel, 0);
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
        textureStore(sp_pages, texel, vec4u(0u));
        return;
    }
    let g = sp_global(m, k, s);
    let gx = bitcast<u32>(g.x);
    let gy = bitcast<u32>(g.y);
    let reset = sp.reset != 0u || m.direction.w != 0.0;
    let old = select(textureLoad(sp_pages_previous, texel, 0), vec4u(0u), reset);
    let valid = (old.z & SV_ALLOCATED) != 0u && old.x == gx && old.y == gy;
    let rect = sp_page_rect(m, k, g);
    var requested = sp.requestsValid != 0u && textureLoad(sp_requests_previous, texel, 0).x != 0u;
    // O nível mais grosso no frustum, sempre: a reserva do que não está numa superfície vista no quadro anterior (os
    // pontos do volume da névoa, o primeiro quadro, um corte, a borda que aparece).
    if (k + 1u == sv_levels(m)) { requested = requested || sp_in_frustum(m, rect); }
    let age = select(min(((old.z >> SV_AGE_SHIFT) & SV_AGE_MASK) + 1u, 255u), 0u, requested);
    if (valid && age <= SP_MAX_AGE) {
        let phys = old.z & SV_PHYS_MASK;
        atomicStore(&sp_scratch[sp.keepBase + phys], 1u);
        let rendered = (old.z & SV_RENDERED) != 0u && !sp_touched(rect);
        textureStore(
            sp_pages,
            texel,
            vec4u(gx, gy, SV_ALLOCATED | select(0u, SV_RENDERED, rendered) | (age << SV_AGE_SHIFT) | phys, old.w),
        );
        if (!rendered) {
            sp_need(i, SP_NEED_RENDER, phys);
        } else {
            // Segue do quadro anterior: o transporte a lê do atlas anterior (atraso 1) para o de agora.
            let c = atomicAdd(&sp_args[(sp.clearRecord + 1u) * 5u + 1u], 1u);
            atomicStore(&sp_scratch[sp.carryBase + c], phys);
        }
        return;
    }
    textureStore(sp_pages, texel, vec4u(gx, gy, 0u, 0u));
    if (requested) { sp_need(i, SP_NEED_ALLOC, 0u); }
}

// ---- 4b. as filas por nível, na ordem do índice ----

var<workgroup> sp_rank: array<u32, 256>;

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
    sp_rank[lid] = count;
    sp_scan(lid);
    var rank = sp_rank[lid] - count;
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
    if (lid == 255u) { atomicStore(&sp_scratch[SP_LEVEL_WORK + k], sp_rank[255]); }
}

// ---- 5. as livres ----

/** Soma de prefixos inclusiva de `sp_rank` no grupo (Hillis–Steele); todas as invocações chamam. */
fn sp_scan(lid: u32) {
    workgroupBarrier();
    for (var d = 1u; d < 256u; d = d << 1u) {
        let v = select(0u, sp_rank[lid - d], lid >= d);
        workgroupBarrier();
        sp_rank[lid] += v;
        workgroupBarrier();
    }
}

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
    sp_rank[lid] = count;
    sp_scan(lid);
    var rank = sp_rank[lid] - count;
    for (var c = 0u; c < SP_FREE_CHUNK; c++) {
        let p = lid * per + c;
        if (c >= per || p >= total) { break; }
        if (atomicLoad(&sp_scratch[sp.keepBase + p]) != 0u) { continue; }
        atomicStore(&sp_scratch[sp.freeBase + rank], p);
        rank++;
    }
    if (lid == 255u) { atomicStore(&sp_scratch[SP_FREE_COUNT], sp_rank[255]); }
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
    sp_rank[lid] = select(0u, 1u, fresh);
    sp_scan(lid);
    let a = sp_rank[lid] - select(0u, 1u, fresh);
    let ok = found && (!fresh || a < atomicLoad(&sp_scratch[SP_FREE_COUNT]));
    if (fresh && ok) { phys = atomicLoad(&sp_scratch[sp.freeBase + a]); }
    // A posição entre as que entram: a da lista das sujas.
    workgroupBarrier();
    sp_rank[lid] = select(0u, 1u, ok);
    sp_scan(lid);
    let d = sp_rank[lid] - select(0u, 1u, ok);
    if (lid == 255u) {
        atomicStore(&sp_scratch[SP_DIRTY_COUNT], sp_rank[255]);
        atomicStore(&sp_args[sp.clearRecord * 5u + 1u], sp_rank[255]);
    }
    if (!ok) { return; }
    let i = word & ~SP_RERENDER;
    let s = vec2u((i % (n * n)) % n, (i % (n * n)) / n);
    let g = sp_global(m, k, s);
    let z0 = bitcast<u32>(m.camera.z);
    textureStore(
        sp_pages,
        vec2u(s.x, s.y + k * n),
        vec4u(bitcast<u32>(g.x), bitcast<u32>(g.y), SV_ALLOCATED | SV_RENDERED | phys, z0),
    );
    let r = sp.dirtyBase + d * 4u;
    atomicStore(&sp_scratch[r], phys | (k << 16u));
    atomicStore(&sp_scratch[r + 1u], bitcast<u32>(g.x));
    atomicStore(&sp_scratch[r + 2u], bitcast<u32>(g.y));
    atomicStore(&sp_scratch[r + 3u], z0);
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
    atomicAdd(&sp_scratch[sp.groupPairsBase + group * 3u], 1u);
}

/** Os trechos dos grupos na reserva dos pares, em ordem; o que passa da reserva fica para os quadros seguintes. */
@compute @workgroup_size(1)
fn sp_pairs_base_main() {
    let capacity = arrayLength(&sp_pairs);
    var running = 0u;
    for (var g = 0u; g < SP_GROUP_LIMIT; g++) {
        if (g >= sp.groupCount) { break; }
        let o = sp.groupPairsBase + g * 3u;
        let n = min(atomicLoad(&sp_scratch[o]), capacity - running);
        atomicStore(&sp_scratch[o + 1u], running);
        atomicStore(&sp_args[sp_groups[g * 4u + 3u] * 5u + 1u], n);
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
    let o = sp.groupPairsBase + group * 3u;
    let idx = atomicAdd(&sp_scratch[o + 2u], 1u);
    if (idx >= atomicLoad(&sp_args[sp_groups[group * 4u + 3u] * 5u + 1u])) { return; }
    sp_pairs[atomicLoad(&sp_scratch[o + 1u]) + idx] = j | (d << SP_PAIR_SHIFT);
}
