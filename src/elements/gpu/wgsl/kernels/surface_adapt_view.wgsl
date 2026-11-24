// As vistas da malha adaptativa além da câmera ativa (spec 041, R20): o nível de cada retalho pelo critério da vista
// (`surface_adapt_view_camera.wgsl`, `surface_adapt_light.wgsl`), com histerese contra o nível do quadro anterior, o
// orçamento e os prefixos de `surface_adapt.wgsl`, e depois:
// - `surface_adapt_view_mark_main` (um por retalho): o retalho é refeito se o nível efetivo, a base dos vértices ou a dos
//   índices mudaram, ou o nível de um vizinho (a costura); a marca vai em `.w` do retalho, o registro do quadro na série;
// - `surface_adapt_view_args_main` (uma thread): o despacho indireto da emissão — a grade inteira se algum retalho foi
//   marcado, nenhum grupo se nenhum (a malha da vista segue como está).
// O registro de cada retalho na série dos níveis (spec 037: a fatia do quadro e a do anterior): `x` = nível efetivo
// (bits 0–7) e o pedido antes do viés (bits 8–15), `y` e `z` = as bases dos vértices e dos índices.
// Requer: surface_adapt; adapt_levels, adapt_levels_previous, adapt_view_dispatch.

/** Palavra do histograma com a marca "algum retalho refeito" (os níveis ocupam 0..7; o viés, 15). */
const ADAPT_CHANGED: u32 = 14u;
/**
 * Histerese: o retalho que já estava num nível mais fino só desce quando pede menos que esta fração dos segmentos do
 * nível de baixo (a borda entre dois níveis não faz o retalho ir e vir quando a vista anda pouco).
 */
const ADAPT_HYSTERESIS: f32 = 0.75;

/** O registro do quadro anterior do retalho `idx` da vista (`ADAPT_NONE` em todas as palavras quando não vale). */
fn adapt_view_previous(idx: u32) -> vec4u {
    if (adapt.levels_valid == 0u) { return vec4u(ADAPT_NONE); }
    return adapt_levels_previous[adapt.levels_base + idx];
}

/** O nível pedido para `n` segmentos, com a histerese contra o pedido do quadro anterior. */
fn adapt_view_level(n: f32, idx: u32) -> u32 {
    var level = adapt_level_of(n, adapt.max_level);
    if (adapt.levels_valid != 0u) {
        let p = (adapt_view_previous(idx).x >> 8u) & 0xFFu;
        if (p > level && p <= adapt.max_level && n > ADAPT_HYSTERESIS * exp2(f32(p) - 1.0)) {
            level = p;
        }
    }
    return level;
}

/** Índice do retalho vizinho (com volta nos domínios periódicos), ou `ADAPT_NONE` fora do domínio. */
fn adapt_view_neighbor(pi: i32, qi: i32) -> u32 {
    var p = pi;
    var q = qi;
    let pu = i32(adapt.patches_u);
    let pv = i32(adapt.patches_v);
    if (p < 0 || p >= pu) {
        if (adapt.periodic_u == 0u) { return ADAPT_NONE; }
        p = (p + pu) % pu;
    }
    if (q < 0 || q >= pv) {
        if (adapt.periodic_v == 0u) { return ADAPT_NONE; }
        q = (q + pv) % pv;
    }
    return u32(q) * adapt.patches_u + u32(p);
}

/** O nível efetivo do vizinho `nb` mudou desde o quadro anterior? */
fn adapt_view_neighbor_changed(nb: u32) -> bool {
    if (nb == ADAPT_NONE) { return false; }
    return (adapt_patches[nb].x & 0xFFu) != (adapt_view_previous(nb).x & 0xFFu);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn surface_adapt_view_mark_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let idx = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let count = adapt.patches_u * adapt.patches_v;
    if (idx >= count) { return; }
    let pd = adapt_patches[idx];
    let now = vec4u(pd.x & 0xFFFFu, pd.y, pd.z, 0u);
    let prev = adapt_view_previous(idx);
    let pi = i32(idx % adapt.patches_u);
    let qi = i32(idx / adapt.patches_u);
    var redo = adapt.force != 0u || adapt.levels_valid == 0u;
    redo = redo || (now.x & 0xFFu) != (prev.x & 0xFFu) || now.y != prev.y || now.z != prev.z;
    redo = redo || adapt_view_neighbor_changed(adapt_view_neighbor(pi - 1, qi));
    redo = redo || adapt_view_neighbor_changed(adapt_view_neighbor(pi + 1, qi));
    redo = redo || adapt_view_neighbor_changed(adapt_view_neighbor(pi, qi - 1));
    redo = redo || adapt_view_neighbor_changed(adapt_view_neighbor(pi, qi + 1));
    adapt_levels[adapt.levels_base + idx] = now;
    // Todos os retalhos leram `.x` dos vizinhos acima; `.w` (a base das arestas, sem uso na vista) vira a marca.
    adapt_patches[idx].w = select(0u, 1u, redo);
    if (redo) { atomicStore(&adapt_hist[ADAPT_CHANGED], 1u); }
}

@compute @workgroup_size(1)
fn surface_adapt_view_args_main() {
    let total = adapt.patches_u * adapt.patches_v * adapt.side * adapt.side;
    let groups = (total + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    var x = 0u;
    var y = 1u;
    if (atomicLoad(&adapt_hist[ADAPT_CHANGED]) != 0u) {
        x = min(groups, 65535u);
        y = (groups + x - 1u) / x;
    }
    adapt_view_dispatch[0] = x;
    adapt_view_dispatch[1] = y;
    adapt_view_dispatch[2] = 1u;
}
