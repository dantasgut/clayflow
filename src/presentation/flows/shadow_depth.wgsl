// Profundidade das páginas sujas do mapa de sombra virtual (spec 034, T060), no atlas em buffer (T060h). Um desenho
// indireto por grupo (geometria, orientação) com uma instância por par (instância do grupo × página suja, `sp_pairs`, a
// partir do trecho do grupo `shadow_group.group`, repartido na GPU); o vértice vai do mundo ao plano da luz e à página
// suja: o desenho é do tamanho de uma página com a borda (130²), e o recorte da janela prende o triângulo a ela. O
// fragmento guarda a profundidade na página física pelo mínimo atômico (os bits de um `f32` positivo seguem a ordem dos
// inteiros). A profundidade é a distância ao longo da luz em torno da referência da página (`z0`), presa em 0 do lado da
// luz (quem está antes da faixa ainda faz sombra). Antes, `sp_fill_main` (as etapas das páginas) preenche cada página
// suja com o fundo (1); as demais seguem no atlas (a série por páginas).
// Recursos declarados no módulo (`shadow_matrices`, `worlds`, `instances`, `sp_scratch_read`, `sp_pairs_read`,
// `shadow_group`, `sp`, `sp_atlas_depth`).

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

/** Texel da página → clip (x à direita, y para cima: a linha 0 da página no topo). */
fn shadow_page_clip(texel: vec2f) -> vec2f {
    return pixel_to_ndc(texel, vec2f(f32(SV_STRIDE)));
}

struct ShadowVsOut {
    @builtin(position) position: vec4f,
    /** A página física. */
    @location(0) @interpolate(flat) phys: u32,
}

@vertex
fn shadow_depth_vs(in: VsIn, @builtin(instance_index) instance: u32) -> ShadowVsOut {
    let m = shadow_matrices[sp.casterSlot];
    let base = sp_scratch_read[sp.groupPairsBase + shadow_group.group * 3u + 1u];
    let pair = sp_pairs_read[base + instance];
    let page = shadow_dirty(pair >> SP_PAIR_SHIFT);
    let world = worlds[instances[pair & SP_PAIR_MASK].world].world * vec4f(in.position, 1.0);
    let l = sv_light(m, world.xyz);
    let t = sv_texel(m, page.level);
    let origin = vec2f(page.global) * sv_page_size(m, page.level) - t;
    var out: ShadowVsOut;
    out.position = vec4f(shadow_page_clip((l.xy - origin) / t), max(sv_depth(m, l.z, page.z0), 0.0), 1.0);
    out.phys = page.phys;
    return out;
}

@fragment
fn shadow_depth_fs(in: ShadowVsOut) {
    let m = shadow_matrices[sp.casterSlot];
    let w = sv_page_word(m, in.phys, vec2u(in.position.xy));
    atomicMin(&sp_atlas_depth[w], bitcast<u32>(clamp(in.position.z, 0.0, 1.0)));
}
