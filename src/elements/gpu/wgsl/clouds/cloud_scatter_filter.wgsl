// O cache de espalhamento filtrado (spec 041, T023, R8; páginas, R11 revisto): as somas dos caminhos (a parte do sol e a
// contagem na metade de baixo do alvo, a parte do céu na de cima: `y` e `y + size.y`; T074) de cada sonda com as vizinhas
// pelo filtro binomial 3 × 3 × 3 (1, 2, 1)³/64 (a borda presa, como o amostrador antes), lidas das páginas que valem (as
// de outra geração, zero): o que a marcha e o panorama leem. Só as sondas cuja vizinhança tem uma
// página marcada no quadro (a que caminhou; todas na geração nova) são refeitas — o resto do alvo segue como está (a
// série por páginas do alvo filtrado). A soma e a contagem filtradas juntas mantêm a média com o peso das oitavas
// (`cloud_scatter_light`) e a sonda sem caminhos (contagem 0) fora dela. Com o sol que anda depressa (os vídeos do pôr
// do sol), as sondas ficam com poucos caminhos e o ruído de cada uma aparecia como estrias horizontais; o filtro junta
// ~19 vezes os caminhos (1/Σw²) por sonda.
// Despacho linear: uma sonda por invocação; teto: 8 marcas e 27 sondas lidas (do cache por uma vista só de leitura em
// `vec4f`, sem os atômicos dos caminhos).
// Requer: WORKGROUP_SIZE, clouds, cloud_scatter_pages, cloud_scatter_cache_read, cloud_scatter_work,
// cloud_scatter_stamps, cloud_scatter_clock, cloud_scatter_filtered_out, cloud_scatter_filtered_stamps,
// cloud_scatter_filtered_clock.

/** A geração da grade, a da página `p` e a sonda `l` dela, pela vista de leitura (quatro palavras por elemento). */
fn cloud_scatter_read_generation() -> u32 {
    return bitcast<u32>(cloud_scatter_cache_read[0].x);
}

fn cloud_scatter_read_page_current(p: u32, gen: u32) -> bool {
    let h = (CLOUD_SCATTER_GLOBAL_WORDS + p * CLOUD_SCATTER_HEADER_WORDS + 4u) / 4u;
    return cloud_scatter_stamps[p] == cloud_scatter_clock.x && bitcast<u32>(cloud_scatter_cache_read[h].x) == gen;
}

fn cloud_scatter_read_probe(p: u32, l: u32) -> CloudScatterProbe {
    let w = cloud_scatter_probe_word(p, l) / 4u;
    return CloudScatterProbe(cloud_scatter_cache_read[w], cloud_scatter_cache_read[w + 1u]);
}

/** A página marcada no quadro que a vizinhança 3 × 3 × 3 da sonda `g` toca? */
fn cloud_scatter_filter_touched(g: vec3u, size: vec3u) -> bool {
    let n = cloud_scatter_pages_of(size);
    let pg = vec3i(g / CLOUD_SCATTER_PAGE);
    let l = g % CLOUD_SCATTER_PAGE;
    // Os deslocamentos de página possíveis por eixo: {0} ou {0, −1} ou {0, +1}.
    let dx = select(select(0, 1, l.x == CLOUD_SCATTER_PAGE - 1u), -1, l.x == 0u);
    let dy = select(select(0, 1, l.y == CLOUD_SCATTER_PAGE - 1u), -1, l.y == 0u);
    let dz = select(select(0, 1, l.z == CLOUD_SCATTER_PAGE - 1u), -1, l.z == 0u);
    for (var c = 0u; c < 8u; c++) {
        let o = vec3i(select(0, dx, (c & 1u) != 0u), select(0, dy, (c & 2u) != 0u), select(0, dz, (c & 4u) != 0u));
        let q = pg + o;
        if (any(q < vec3i(0)) || any(q >= vec3i(n))) { continue; }
        let p = u32(q.x) + n.x * (u32(q.y) + n.y * u32(q.z));
        if (atomicLoad(&cloud_scatter_work[cloud_scatter_work_dirty(p)]) != 0u) { return true; }
    }
    return false;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_scatter_filter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = clouds_scatter_size();
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    // Nenhuma página caminhou nem recomeçou no quadro: o alvo filtrado segue como está.
    if (i >= size.x * size.y * size.z || atomicLoad(&cloud_scatter_work[CLOUD_SCATTER_WORK_ANY]) == 0u) { return; }
    let g = vec3u(i % size.x, (i / size.x) % size.y, i / (size.x * size.y));
    if (!cloud_scatter_filter_touched(g, size)) { return; }
    let gen = cloud_scatter_read_generation();
    var sun = vec4f(0.0);
    var sky = vec4f(0.0);
    for (var c = 0u; c < 27u; c++) {
        let o = vec3i(i32(c % 3u), i32((c / 3u) % 3u), i32(c / 9u)) - 1;
        let w = f32((2 - abs(o.x)) * (2 - abs(o.y)) * (2 - abs(o.z)));
        let q = vec3u(clamp(vec3i(g) + o, vec3i(0), vec3i(size) - 1));
        let pl = cloud_scatter_page_of(q, size);
        if (cloud_scatter_read_page_current(pl.x, gen)) {
            let v = cloud_scatter_read_probe(pl.x, pl.y);
            sun += w * v.sun;
            sky += w * v.sky;
        }
    }
    textureStore(cloud_scatter_filtered_out, g, sun / 64.0);
    textureStore(cloud_scatter_filtered_out, g + vec3u(0u, size.y, 0u), vec4f(sky.rgb / 64.0, sun.a / 64.0));
    let own = cloud_scatter_page_of(g, size);
    if (own.y == 0u) { cloud_scatter_filtered_stamps[own.x] = cloud_scatter_filtered_clock.x; }
}
