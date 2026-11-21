// A leitura do volume de τ até o sol perto da câmera (spec 041, T074): no nível mais fino cuja janela contém o ponto, a
// interpolação trilinear dos nós da página que contém o ponto (o amostrador dentro da página física, que tem o nó da
// vizinha): o τ do trecho do cone (r) e o resto da luz do fim dele (g: o pedaço até o nó e o nó do mapa visto do sol,
// `cloud_sun_rest`; só com a célula até `CLOUD_SUN_VOLUME_REST_FOOTPRINT` pegadas do pixel da marcha ali, `footprint`) —
// cada um onde a página vale para ele no quadro (as marcas da escolha); senão −1. Espelho de
// `sunVolumeLookup` em `reference/cloudSunVolume.ts`.
// Requer: cloud_sun_volume_grid, cloud_common, clouds, cloud_sun_volume_tex, cloud_sun_volume_valid,
// cloud_clamp_sampler.

/**
 * O maior lado da célula do resto da luz, em pegadas do pixel da marcha (o nível 0 sempre): o resto carrega a sombra de
 * uma nuvem sobre a outra pelo mapa visto do sol, de bordas nítidas com o sol baixo, e a célula grossa a borra (`sunset`
 * 4,0 → 6,5 % com o resto em todos os níveis; com o cone só, 4,0 %). O cone fica em todos os níveis.
 */
const CLOUD_SUN_VOLUME_REST_FOOTPRINT: f32 = 1.0;

/** A pegada (m) do pixel da marcha no ponto que a luz ilumina (`cloud_integrate` a escreve; 0 nos outros usos). */
var<private> cloud_light_footprint: f32 = 0.0;

/** A marca da página `slot` na parte `part` (0 o cone, 1 o resto). */
fn cloud_sun_volume_valid_at(slot: u32, part: u32) -> bool {
    let w = CLOUD_SUN_VOLUME_WORK_VALID + part * CLOUD_SUN_VOLUME_VALID_WORDS + slot / 32u;
    return (cloud_sun_volume_valid[w] & (1u << (slot % 32u))) != 0u;
}

/** A leitura do nível `k` na página global `g` (x, z) e na camada `gy`: o cone e o resto do nó filtrado e o lugar. */
fn cloud_sun_volume_sample(k: u32, c: vec3f, g: vec2i, gy: i32) -> vec4f {
    let P = f32(CLOUD_SUN_VOLUME_PAGE);
    let page = vec3u(
        cloud_sun_volume_wrap(g.x, CLOUD_SUN_VOLUME_PAGES.x),
        u32(gy),
        cloud_sun_volume_wrap(g.y, CLOUD_SUN_VOLUME_PAGES.z),
    );
    let slot = cloud_sun_volume_slot(k, page);
    let l = clamp(c - vec3f(f32(g.x), f32(gy), f32(g.y)) * P, vec3f(0.0), vec3f(P));
    let uvw = (vec3f(cloud_sun_volume_atlas(k, page)) + l + 0.5) / vec3f(textureDimensions(cloud_sun_volume_tex));
    let v = textureSampleLevel(cloud_sun_volume_tex, cloud_clamp_sampler, uvw, 0.0);
    return vec4f(max(v.r, 0.0), max(v.g, 0.0), f32(slot), 0.0);
}

/**
 * O volume no ponto `x` (a pegada `footprint` do pixel da marcha): o τ do cone (x, −1 sem), o resto (y, −1 sem) e o peso
 * do volume no cone (z): no anel de fora da janela do nível (a última página), o nível seguinte entra aos poucos —
 * no último nível, ou com a página seguinte que não vale, o cone (z < 1: quem lê marcha o cone e mistura) —, sem degrau
 * de luz na borda das janelas.
 */
fn cloud_sun_volume_at(x: vec3f, footprint: f32) -> vec3f {
    if (!cloud_sun_volume_on()) { return vec3f(-1.0, -1.0, 0.0); }
    let P = f32(CLOUD_SUN_VOLUME_PAGE);
    let cy = (cloud_altitude(x) - clouds.shell.y) / cloud_sun_volume_spacing();
    if (cy < 0.0 || cy > P * f32(CLOUD_SUN_VOLUME_PAGES.y)) { return vec3f(-1.0, -1.0, 0.0); }
    let gy = clamp(i32(floor(cy / P)), 0, i32(CLOUD_SUN_VOLUME_PAGES.y) - 1);
    let rest_reach = max(CLOUD_SUN_VOLUME_REST_FOOTPRINT * footprint, clouds.sunVolume.x);
    let n = vec2f(CLOUD_SUN_VOLUME_PAGES.xz);
    var found = false;
    var out = vec3f(-1.0, -1.0, 0.0);
    var blend = 1.0;
    for (var k = 0u; k < CLOUD_SUN_VOLUME_LEVELS; k++) {
        let cell = cloud_sun_volume_cell(k);
        let cxz = (x.xz - clouds.coverageOffset.xy) / cell;
        let rel = cxz / P - vec2f(cloud_sun_volume_window_start(k));
        if (any(rel < vec2f(0.0)) || any(rel >= n)) { continue; }
        let g = vec2i(floor(cxz / P));
        let s = cloud_sun_volume_sample(k, vec3f(cxz.x, cy, cxz.y), g, gy);
        let slot = u32(s.z);
        let valid = cloud_sun_volume_valid_at(slot, 0u);
        if (!found) {
            if (!valid) { return vec3f(-1.0, -1.0, 0.0); }
            let rest = cell <= rest_reach && cloud_sun_volume_valid_at(slot, 1u);
            out = vec3f(s.x, select(-1.0, s.y, rest), 1.0);
            // A distância (páginas) à borda da janela: no anel de fora, o seguinte entra.
            let e = min(min(rel.x, rel.y), min(n.x - rel.x, n.y - rel.y));
            if (e >= 1.0) { return out; }
            blend = e;
            found = true;
            out.z = blend;
            continue;
        }
        // O nível seguinte no anel: a mistura pela distância à borda do de dentro; o resto, só onde os dois o têm.
        if (!valid) { return out; }
        let rest = out.y >= 0.0 && cell <= rest_reach && cloud_sun_volume_valid_at(slot, 1u);
        return vec3f(mix(s.x, out.x, blend), select(-1.0, mix(s.y, out.y, blend), rest), 1.0);
    }
    return out;
}
