// Páginas das texturas virtuais (spec 034, T060c), no `VirtualTextureFlow`, antes do desenho:
//   1. `vt_commit_main` (uma invocação por posição da lista): as páginas que a CPU carregou no atlas neste quadro (a
//      lista `vt_commits`) — a entrada ainda pendente na mesma página física passa a residente, e a página física é
//      carimbada na época da série do atlas;
//   2. `vt_clear_main`: os contadores e as marcas das páginas físicas do quadro zerados;
//   3. `vt_update_main` (uma por página virtual): a residente que a série do atlas não tem carimbada na época atual sai;
//      a residente envelhece (zera quando pedida) e marca a página física com a idade e a dona; a pendente envelhece e
//      sai depois de `VT_PENDING_MAX` quadros sem carga; a sem página pedida (os pedidos do quadro anterior, a série dos
//      pedidos, e sempre a página mais grossa de cada imagem; só das imagens preparadas) precisa de alocação;
//   4. `vt_rank_main` (um grupo, nível a nível): as filas de cada nível na ordem do índice, até o orçamento;
//   5. `vt_free_main` (um grupo): as páginas físicas livres em ordem e, depois delas, as residentes não pedidas há
//      `VT_EVICT_AGE` quadros ou mais (o despejo, na ordem do índice);
//   6. `vt_allocate_main` (um grupo; só nos quadros em que a CPU lê a lista): as filas do nível mais grosso ao mais fino
//      até o orçamento e as livres — a entrada
//      fica pendente na página física, a dona despejada sai da tabela e o par (página virtual, física) vai à lista que a
//      CPU lê de volta (`vt_loads`) com as contagens do quadro (a CPU pede os texels à fonte da imagem);
//   7. `vt_requests_clear_main`: a fatia de agora da série dos pedidos zerada (o desenho do quadro a escreve).
// Laços com teto constante. Referência: `material/virtual/reference/virtualTexture.ts` (`vtAllocate`).
// Requer: vt_common, page_alloc, WORKGROUP_SIZE e os recursos de cada entrada.

const VT_EVICT_AGE: u32 = 8u;
const VT_PENDING_MAX: u32 = 240u;
const VT_PINNED: u32 = 0xFFFFu;
/** Teto das páginas virtuais percorridas por invocação nas filas (4096 × 256 ≥ 1 M páginas). */
const VT_RANK_CHUNK: u32 = 4096u;
/** Teto das páginas físicas por invocação nas livres (64² / 256). */
const VT_FREE_CHUNK: u32 = 16u;
/** Seções do espaço de trabalho (`vt_scratch`, palavras): as filas por nível, as contagens e as marcas. */
const VT_LEVEL_COUNT: u32 = 0u;
const VT_FREE_COUNT: u32 = 16u;
const VT_REQUESTED: u32 = 17u;
const VT_RESIDENT_COUNT: u32 = 18u;
const VT_PENDING_COUNT: u32 = 19u;
const VT_STATE_WORDS: u32 = 32u;

fn vt_physical() -> u32 {
    return vt_cache.atlasPages * vt_cache.atlasPages;
}

/** Marca (1 + idade, ou presa) de cada página física; a dona; as livres; a necessidade de cada virtual; as filas. */
fn vt_keep_at(phys: u32) -> u32 { return VT_STATE_WORDS + phys; }
fn vt_owner_at(phys: u32) -> u32 { return VT_STATE_WORDS + vt_physical() + phys; }
fn vt_free_at(k: u32) -> u32 { return VT_STATE_WORDS + 2u * vt_physical() + k; }
fn vt_need_at(g: u32) -> u32 { return VT_STATE_WORDS + 3u * vt_physical() + g; }
fn vt_queue_at(level: u32, k: u32) -> u32 {
    return VT_STATE_WORDS + 3u * vt_physical() + vt_cache.totalPages + level * vt_cache.budget + k;
}

// ---- 1. as cargas do quadro ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn vt_commit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let c = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (c >= min(vt_frame.commits, vt_cache.budget)) { return; }
    let g = vt_commits[2u * c];
    let phys = vt_commits[2u * c + 1u];
    if (g >= vt_cache.totalPages || phys >= vt_physical()) { return; }
    let w = vt_table[1] + g;
    let entry = vt_table[w];
    if ((entry & VT_PENDING) == 0u || (entry & VT_PHYS_MASK) != phys) { return; }
    vt_table[w] = VT_RESIDENT | phys;
    // O carimbo da série do atlas: a página escrita na época atual.
    vt_atlas_stamps[phys] = vt_atlas_clock.x;
}

// ---- 2. o início do quadro ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn vt_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i < VT_STATE_WORDS) { atomicStore(&vt_scratch[i], 0u); }
    if (i < vt_physical()) { atomicStore(&vt_scratch[vt_keep_at(i)], 0u); }
}

// ---- 3. a tabela ----

/** A página mais grossa da imagem da página `g` (a reserva: sempre pedida). */
fn vt_coarsest(g: u32) -> bool {
    let image = vt_table[vt_table[3] + g] & 0xFFFFu;
    return vt_table[VT_PREAMBLE + image * VT_HEADER + 7u] == g;
}

/** A imagem da página `g` está preparada (a fonte guarda a pirâmide: as páginas dela podem ser pedidas)? */
fn vt_ready(g: u32) -> bool {
    let image = vt_table[vt_table[3] + g] & 0xFFFFu;
    return vt_table[VT_PREAMBLE + image * VT_HEADER + VT_READY_WORD] != 0u;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn vt_update_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let g = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (g >= vt_cache.totalPages) { return; }
    let w = vt_table[1] + g;
    var entry = vt_table[w];
    atomicStore(&vt_scratch[vt_need_at(g)], 0u);
    let requested = vt_ready(g) && ((vt_frame.requestsValid != 0u && vt_requests_previous[g] != 0u) || vt_coarsest(g));
    if (requested) { atomicAdd(&vt_scratch[VT_REQUESTED], 1u); }
    let phys = entry & VT_PHYS_MASK;
    // A residente vale só carimbada na época atual da série do atlas.
    if ((entry & VT_RESIDENT) != 0u && (phys >= vt_physical() || vt_atlas_stamps[phys] != vt_atlas_clock.x)) {
        entry = 0u;
    }
    var age = min((entry >> VT_AGE_SHIFT) + 1u, 255u);
    if ((entry & VT_RESIDENT) != 0u) {
        if (requested) { age = 0u; }
        vt_table[w] = VT_RESIDENT | phys | (age << VT_AGE_SHIFT);
        atomicStore(&vt_scratch[vt_keep_at(phys)], 1u + age);
        atomicStore(&vt_scratch[vt_owner_at(phys)], g);
        atomicAdd(&vt_scratch[VT_RESIDENT_COUNT], 1u);
        return;
    }
    if ((entry & VT_PENDING) != 0u && age <= VT_PENDING_MAX && phys < vt_physical()) {
        vt_table[w] = VT_PENDING | phys | (age << VT_AGE_SHIFT);
        atomicStore(&vt_scratch[vt_keep_at(phys)], VT_PINNED);
        atomicAdd(&vt_scratch[VT_PENDING_COUNT], 1u);
        return;
    }
    vt_table[w] = 0u;
    if (requested) { atomicStore(&vt_scratch[vt_need_at(g)], 1u); }
}

// ---- 4. as filas por nível, na ordem do índice ----

@compute @workgroup_size(256)
fn vt_rank_main(@builtin(local_invocation_index) lid: u32) {
    let n = vt_cache.totalPages;
    let per = (n + 255u) / 256u;
    let first = lid * per;
    let info = vt_table[3];
    for (var level = 0u; level < VT_MAX_LEVELS; level++) {
        var count = 0u;
        for (var c = 0u; c < VT_RANK_CHUNK; c++) {
            let g = first + c;
            if (c >= per || g >= n) { break; }
            if (atomicLoad(&vt_scratch[vt_need_at(g)]) != 0u && (vt_table[info + g] >> 16u) == level) { count++; }
        }
        var rank = pa_exclusive(lid, count);
        for (var c = 0u; c < VT_RANK_CHUNK; c++) {
            let g = first + c;
            if (c >= per || g >= n || rank >= vt_cache.budget) { break; }
            if (atomicLoad(&vt_scratch[vt_need_at(g)]) == 0u || (vt_table[info + g] >> 16u) != level) { continue; }
            atomicStore(&vt_scratch[vt_queue_at(level, rank)], g);
            rank++;
        }
        if (lid == 255u) { atomicStore(&vt_scratch[VT_LEVEL_COUNT + level], min(pa_rank[255], vt_cache.budget)); }
    }
}

// ---- 5. as livres e as despejáveis ----

/** A página física é livre (nível 0) ou despejável (nível 1: residente não pedida há `VT_EVICT_AGE` quadros)? */
fn vt_free_tier(phys: u32, tier: u32) -> bool {
    let keep = atomicLoad(&vt_scratch[vt_keep_at(phys)]);
    if (tier == 0u) { return keep == 0u; }
    return keep != 0u && keep != VT_PINNED && keep - 1u >= VT_EVICT_AGE;
}

@compute @workgroup_size(256)
fn vt_free_main(@builtin(local_invocation_index) lid: u32) {
    let total = vt_physical();
    let per = (total + 255u) / 256u;
    var base = 0u;
    for (var tier = 0u; tier < 2u; tier++) {
        var count = 0u;
        for (var c = 0u; c < VT_FREE_CHUNK; c++) {
            let p = lid * per + c;
            if (c >= per || p >= total) { break; }
            if (vt_free_tier(p, tier)) { count++; }
        }
        var rank = base + pa_exclusive(lid, count);
        for (var c = 0u; c < VT_FREE_CHUNK; c++) {
            let p = lid * per + c;
            if (c >= per || p >= total) { break; }
            if (!vt_free_tier(p, tier)) { continue; }
            atomicStore(&vt_scratch[vt_free_at(rank)], p);
            rank++;
        }
        base += pa_rank[255];
        workgroupBarrier();
    }
    if (lid == 0u) { atomicStore(&vt_scratch[VT_FREE_COUNT], base); }
}

// ---- 6. a alocação ----

@compute @workgroup_size(256)
fn vt_allocate_main(@builtin(local_invocation_index) lid: u32) {
    // A posição `lid` na ordem: do nível mais grosso ao mais fino.
    var t = lid;
    var level = 0u;
    var found = false;
    for (var step = 0u; step < VT_MAX_LEVELS; step++) {
        let k = VT_MAX_LEVELS - 1u - step;
        let c = atomicLoad(&vt_scratch[VT_LEVEL_COUNT + k]);
        if (t < c) {
            level = k;
            found = true;
            break;
        }
        t -= c;
    }
    let free = atomicLoad(&vt_scratch[VT_FREE_COUNT]);
    let ok = vt_frame.allocate != 0u && found && lid < vt_cache.budget && lid < free;
    // As posições que entram formam um prefixo: a contagem é a soma.
    let d = pa_exclusive(lid, select(0u, 1u, ok));
    if (lid == 0u) {
        vt_loads[0] = pa_rank[255];
        vt_loads[1] = atomicLoad(&vt_scratch[VT_REQUESTED]);
        vt_loads[2] = atomicLoad(&vt_scratch[VT_RESIDENT_COUNT]);
        vt_loads[3] = atomicLoad(&vt_scratch[VT_PENDING_COUNT]);
    }
    if (!ok) { return; }
    let g = atomicLoad(&vt_scratch[vt_queue_at(level, t)]);
    let phys = atomicLoad(&vt_scratch[vt_free_at(lid)]);
    // A dona despejada sai da tabela (a página física livre não tem dona: a marca zerada).
    if (atomicLoad(&vt_scratch[vt_keep_at(phys)]) != 0u) {
        let owner = atomicLoad(&vt_scratch[vt_owner_at(phys)]);
        vt_table[vt_table[1] + owner] = 0u;
    }
    vt_table[vt_table[1] + g] = VT_PENDING | phys;
    vt_loads[4u + 2u * d] = g;
    vt_loads[4u + 2u * d + 1u] = phys;
}

// ---- 7. os pedidos do quadro ----

@compute @workgroup_size(WORKGROUP_SIZE)
fn vt_requests_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let g = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (g < arrayLength(&vt_requests_now)) { vt_requests_now[g] = 0u; }
}
