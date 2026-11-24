// Profundidade das páginas sujas do mapa de sombra virtual (spec 034, T060), no atlas em buffer (T060h). Um desenho
// indireto por grupo (geometria, orientação) com uma instância por par (instância do grupo × página suja, `sp_pairs`, a
// partir do trecho do grupo `shadow_group.group`, repartido na GPU); o vértice vai do mundo ao plano da luz e à página
// suja: o desenho é do tamanho de uma página com a borda (130²), e o recorte da janela prende o triângulo a ela. O
// fragmento guarda a profundidade na página física pelo mínimo atômico (os bits de um `f32` positivo seguem a ordem dos
// inteiros). A profundidade é a distância ao longo da luz em torno da referência da página (`z0`), presa em 0 do lado da
// luz (quem está antes da faixa ainda faz sombra). Antes, `sp_fill_main` (as etapas das páginas) preenche cada página
// suja com o fundo (1); as demais seguem no atlas (a série por páginas).
// Um passe para todas as vistas de sombra (spec 013): a página suja leva a vista dela (o referencial do vértice), e o
// atlas é um só.
// Recursos declarados no módulo (`shadow_matrices`, `worlds`, `instances`, `sp_scratch_read`, `sp_pairs_read`,
// `shadow_group`, `sp`, `sp_atlas_depth`; requer shadow_pages_views; na malha grande, `shadow_cluster_vertices` e `shadow_cluster_indices`; nos
// sprites, `ss_list_read`).

struct VsIn {
    @location(0) position: vec3<f32>,
}

/** A página suja `d`: a vista, o nível, a página global, a física e a referência de profundidade. */
struct ShadowDirtyPage {
    view: u32,
    level: u32,
    global: vec2i,
    phys: u32,
    z0: f32,
}

fn shadow_dirty(d: u32) -> ShadowDirtyPage {
    let r = sp.dirtyBase + d * 4u;
    let w = sp_scratch_read[r];
    return ShadowDirtyPage(
        (w >> SP_DIRTY_VIEW_SHIFT) & SP_DIRTY_FIELD_MASK,
        (w >> SP_DIRTY_LEVEL_SHIFT) & SP_DIRTY_FIELD_MASK,
        vec2i(bitcast<i32>(sp_scratch_read[r + 1u]), bitcast<i32>(sp_scratch_read[r + 2u])),
        w & SP_DIRTY_PHYS_MASK,
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
    /** Na vista em perspectiva (y = 1): a profundidade linear guardada (x), interpolada com a correção de perspectiva. */
    @location(1) depth: vec2f,
}

/** O ponto `p` (espaço do objeto) do par `pair` (instância × página suja) na página do desenho. */
fn shadow_depth_place(p: vec3f, pair: u32) -> ShadowVsOut {
    let page = shadow_dirty(pair >> SP_PAIR_SHIFT);
    let m = sp_view_matrix(page.view);
    let world = worlds[instances[pair & SP_PAIR_MASK].world].world * vec4f(p, 1.0);
    let t = sv_texel(m, page.level);
    let origin = vec2f(page.global) * sv_page_size(m, page.level) - t;
    var out: ShadowVsOut;
    out.phys = page.phys;
    if (m.kind == 1u) {
        // A vista em perspectiva (spec 013): o recorte da página é afim no plano da vista q = (x, y) / (z · tan) —
        // clip(q) = c0 + cx · q.x + cy · q.y —, e a posição homogênea é clip(q) · w com w = z (a divisão é do rasterizador:
        // o triângulo que passa por trás da luz é cortado no plano próximo). A profundidade guardada é a linear ao longo
        // do eixo, levada ao fragmento como atributo.
        let v = sv_view(m, world.xyz);
        let c0 = shadow_page_clip((vec2f(0.0) - origin) / t);
        let cx = shadow_page_clip((vec2f(1.0, 0.0) - origin) / t) - c0;
        let cy = shadow_page_clip((vec2f(0.0, 1.0) - origin) / t) - c0;
        let qw = v.xy / m.origin.w;
        out.position = vec4f(c0 * v.z + cx * qw.x + cy * qw.y, (v.z - m.near) * m.far / (m.far - m.near), v.z);
        out.depth = vec2f(sv_depth(m, v.z, page.z0), 1.0);
        return out;
    }
    let l = sv_light(m, world.xyz);
    out.position = vec4f(shadow_page_clip((l.xy - origin) / t), max(sv_depth(m, l.z, page.z0), 0.0), 1.0);
    out.depth = vec2f(0.0);
    return out;
}

@vertex
fn shadow_depth_vs(in: VsIn, @builtin(instance_index) instance: u32) -> ShadowVsOut {
    let base = sp_scratch_read[sp.groupPairsBase + shadow_group.group * 4u + 1u];
    return shadow_depth_place(in.position, sp_pairs_read[base + instance]);
}

/**
 * A malha grande em aglomerados (`sp_clusters_main`): uma instância por par (aglomerado, par do grupo) da lista do
 * grupo, `SP_CLUSTER_TRIS` triângulos por instância, os vértices lidos pelos índices (`shadow_cluster_vertices`,
 * `shadow_cluster_indices`, ligados ao pipeline da geometria). Além do teto da lista e do fim dos índices, o triângulo
 * degenerado.
 */
@vertex
fn shadow_cluster_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) instance: u32) -> ShadowVsOut {
    var out: ShadowVsOut;
    out.position = vec4f(0.0, 0.0, 2.0, 1.0);
    out.phys = 0u;
    out.depth = vec2f(0.0);
    if (instance >= shadow_group.listCap) { return out; }
    let entry = sp_scratch_read[shadow_group.listBase + instance];
    let i = (entry & SP_CLUSTER_MASK) * SP_CLUSTER_TRIS * 3u + v;
    // Os índices do quadro: a capacidade ou, na malha adaptativa, a contagem dela (`countWord`).
    var indexCount = shadow_group.indexCount;
    if (shadow_group.countWord != 0u) { indexCount = min(indexCount, sp_scratch_read[shadow_group.countWord]); }
    if (i >= indexCount) { return out; }
    let base = sp_scratch_read[sp.groupPairsBase + shadow_group.group * 4u + 1u];
    let pair = sp_pairs_read[base + (entry >> SP_CLUSTER_SHIFT)];
    let k = shadow_cluster_indices[i] * 8u;
    let p = vec3f(shadow_cluster_vertices[k], shadow_cluster_vertices[k + 1u], shadow_cluster_vertices[k + 2u]);
    return shadow_depth_place(p, pair);
}

@fragment
fn shadow_depth_fs(in: ShadowVsOut) {
    let w = sp_atlas_word(in.phys, vec2u(in.position.xy));
    let depth = select(in.position.z, in.depth.x, in.depth.y > 0.5);
    atomicMin(&sp_atlas_depth[w], bitcast<u32>(clamp(depth, 0.0, 1.0)));
}

// ---- os sprites que projetam (esferas impostoras; a lista de `ss_pairs_main`) ----

struct ShadowSpriteOut {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) phys: u32,
    /** O lado de um texel do nível da página (m) e a meia faixa de profundidade da vista (m). */
    @location(1) @interpolate(flat) scale: vec2f,
    /** O centro do disco na página (texels) e o raio (texels). */
    @location(2) @interpolate(flat) disk: vec3f,
    /** A profundidade do centro (espaço da luz) e a referência da página. */
    @location(3) @interpolate(flat) depth: vec2f,
}

/**
 * Um par (sprite, página suja) por instância, seis vértices: o quadrado do disco na página (com 1 texel de folga); o
 * fragmento recorta o disco. Além do teto da lista, o quadrado degenerado.
 */
@vertex
fn shadow_sprite_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) instance: u32) -> ShadowSpriteOut {
    var out: ShadowSpriteOut;
    out.position = vec4f(0.0, 0.0, 2.0, 1.0);
    out.phys = 0u;
    out.scale = vec2f(1.0);
    out.disk = vec3f(0.0);
    out.depth = vec2f(0.0);
    if (instance >= sp.spriteCap) { return out; }
    let e = instance * SS_ENTRY_WORDS;
    let l = vec3f(
        bitcast<f32>(ss_list_read[e]),
        bitcast<f32>(ss_list_read[e + 1u]),
        bitcast<f32>(ss_list_read[e + 2u]),
    );
    let r = bitcast<f32>(ss_list_read[e + 3u]);
    let page = shadow_dirty(ss_list_read[e + 4u]);
    let m = sp_view_matrix(page.view);
    let t = sv_texel(m, page.level);
    let origin = vec2f(page.global) * sv_page_size(m, page.level) - t;
    let center = (l.xy - origin) / t;
    let corners = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    );
    let radius = r / t;
    out.position = vec4f(shadow_page_clip(center + corners[v % 6u] * (radius + 1.0)), 0.5, 1.0);
    out.phys = page.phys;
    // O texel em metros à profundidade do sprite (na vista em perspectiva, pela distância).
    out.scale = vec2f(t * sv_metres(m, l.z), m.depthRange);
    out.disk = vec3f(center, radius);
    out.depth = vec2f(l.z, page.z0);
    return out;
}

/** A face da esfera voltada para a luz: `z = z_c − √(r² − ρ²)` dentro do disco, pelo mínimo atômico. */
@fragment
fn shadow_sprite_fs(in: ShadowSpriteOut) {
    let rho = length(in.position.xy - in.disk.xy);
    if (rho > in.disk.z) { discard; }
    let h = sqrt(max(in.disk.z * in.disk.z - rho * rho, 0.0)) * in.scale.x;
    // A profundidade guardada (`sv_depth`) pela meia faixa da vista.
    let depth = clamp((in.depth.x - h - in.depth.y) / (2.0 * in.scale.y) + 0.5, 0.0, 1.0);
    let w = sp_atlas_word(in.phys, vec2u(in.position.xy));
    atomicMin(&sp_atlas_depth[w], bitcast<u32>(depth));
}
