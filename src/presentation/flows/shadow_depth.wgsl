// Profundidade das páginas sujas do mapa de sombra virtual (spec 034, T060), no atlas do quadro. Um desenho indireto por
// grupo (geometria, orientação) com uma instância por par (instância do grupo × página suja, `sp_pairs`, a partir do
// trecho do grupo `shadow_group.group`, repartido na GPU); o vértice vai do mundo ao plano da luz, à página suja e ao atlas. A
// profundidade é a distância ao longo da luz em torno da referência da página (`z0`), presa em 0 do lado da luz (quem
// está antes da faixa ainda faz sombra). Cada página leva 1 texel de borda; o triângulo é recortado a ela pelas
// distâncias de recorte (`shadow_depth_vs`, no módulo `shadow_depth_clip`) ou, sem a feature, pelo descarte no
// fragmento (`shadow_depth_discard_vs` e `shadow_depth_fs`). Antes,
// `shadow_carry_vs`/`shadow_carry_fs` trazem as páginas que seguem do atlas do quadro anterior (a série do atlas, atraso 1)
// e `shadow_clear_vs` preenche cada página suja com o fundo (1).
// Recursos declarados no módulo (`shadow_matrices`, `worlds`, `instances`, `sp_scratch_read`, `sp_pairs_read`,
// `shadow_group`, `sp`, `shadow_atlas_previous`).

struct VsIn {
    @location(0) position: vec3<f32>,
}

/** A página suja `d`: o nível, a página global, a física e a referência de profundidade. */
struct ShadowDirtyPage {
    level: u32,
    global: vec2i,
    phys: u32,
    z0: f32,
}

fn shadow_dirty(d: u32) -> ShadowDirtyPage {
    let r = sp.dirtyBase + d * 4u;
    let w = sp_scratch_read[r];
    return ShadowDirtyPage(
        w >> 16u,
        vec2i(bitcast<i32>(sp_scratch_read[r + 1u]), bitcast<i32>(sp_scratch_read[r + 2u])),
        w & 0xFFFFu,
        bitcast<f32>(sp_scratch_read[r + 3u]),
    );
}

/** Canto (texel) da página física `phys` no atlas, com a borda. */
fn shadow_page_corner(m: ShadowMatrix, phys: u32) -> vec2f {
    let a = m.atlasPages;
    return vec2f(f32((phys % a) * SV_STRIDE), f32((phys / a) * SV_STRIDE));
}

/** Texel do atlas → clip (x à direita, y para cima: a linha 0 do atlas no topo). */
fn shadow_atlas_clip(m: ShadowMatrix, texel: vec2f) -> vec2f {
    return pixel_to_ndc(texel, vec2f(f32(m.atlasPages * SV_STRIDE)));
}

struct ShadowVsOut {
    @builtin(position) position: vec4f,
    /** A página no atlas (texels): x0, y0, x1, y1. */
    @location(0) @interpolate(flat) page: vec4f,
}

fn shadow_vertex(position: vec3f, instance: u32) -> ShadowVsOut {
    let m = shadow_matrices[sp.casterSlot];
    let base = sp_scratch_read[sp.groupPairsBase + shadow_group.group * 3u + 1u];
    let pair = sp_pairs_read[base + instance];
    let page = shadow_dirty(pair >> SP_PAIR_SHIFT);
    let world = worlds[instances[pair & SP_PAIR_MASK].world].world * vec4f(position, 1.0);
    let l = sv_light(m, world.xyz);
    let t = sv_texel(m, page.level);
    let origin = vec2f(page.global) * sv_page_size(m, page.level) - t;
    let corner = shadow_page_corner(m, page.phys);
    let texel = corner + (l.xy - origin) / t;
    var out: ShadowVsOut;
    out.position = vec4f(shadow_atlas_clip(m, texel), max(sv_depth(m, l.z, page.z0), 0.0), 1.0);
    out.page = vec4f(corner, corner + f32(SV_STRIDE));
    return out;
}

@vertex
fn shadow_depth_discard_vs(in: VsIn, @builtin(instance_index) instance: u32) -> ShadowVsOut {
    return shadow_vertex(in.position, instance);
}

@fragment
fn shadow_depth_fs(in: ShadowVsOut) {
    if (any(in.position.xy < in.page.xy) || any(in.position.xy >= in.page.zw)) { discard; }
}

/** O fundo da página suja `instance` (dois triângulos na página inteira, com a borda). */
@vertex
fn shadow_clear_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> @builtin(position) vec4f {
    let m = shadow_matrices[sp.casterSlot];
    let page = shadow_dirty(instance);
    let corner = shadow_page_corner(m, page.phys);
    let quad = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
    return vec4f(shadow_atlas_clip(m, corner + quad[vertex] * f32(SV_STRIDE)), 1.0, 1.0);
}

struct ShadowCarryOut {
    @builtin(position) position: vec4f,
}

/** A página física que segue `instance` (dois triângulos na página inteira, com a borda). */
@vertex
fn shadow_carry_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> ShadowCarryOut {
    let m = shadow_matrices[sp.casterSlot];
    let corner = shadow_page_corner(m, sp_scratch_read[sp.carryBase + instance]);
    let quad = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
    var out: ShadowCarryOut;
    out.position = vec4f(shadow_atlas_clip(m, corner + quad[vertex] * f32(SV_STRIDE)), 1.0, 1.0);
    return out;
}

/** A profundidade do mesmo texel no atlas do quadro anterior. */
@fragment
fn shadow_carry_fs(in: ShadowCarryOut) -> @builtin(frag_depth) f32 {
    return textureLoad(shadow_atlas_previous, vec2u(in.position.xy), 0);
}
