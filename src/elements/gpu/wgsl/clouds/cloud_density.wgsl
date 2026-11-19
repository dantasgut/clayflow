// Densidade das nuvens (spec 041, R3–R6, R19): a cobertura (o mapa centrado na câmera; fora dele, os valores globais),
// o perfil de altura pelo tipo até o topo local (com o tempo, o topo do estado — a torre do cúmulo-nimbo, o cúmulo raso —
// levado pela força da célula: `cloud_tower_reach`), a forma pelo volume periódico (Perlin-Worley remapeado pelo fBm de
// Worley) deslocado pelo vento e inclinado pela altura, a erosão das bordas pelo volume de detalhe (com o vento, derivando
// para cima), a água da torre (`cloud_tower_water`) e, com o tempo, a bigorna (o canal B do mapa: a cobertura dela,
// trazida pelo vento da alta troposfera). Densidade relativa (≥ 0); a extinção é ela × `clouds.layer.z`. Espelho de
// `cloudDensity` em `cloudModel.ts`.
// Requer: cloud_coverage_field, cloud_common, clouds, cloud_shape_tex, cloud_detail_tex, cloud_coverage_tex, cloud_noise_sampler,
// cloud_clamp_sampler.

const CLOUD_EROSION: f32 = 0.35;
const CLOUD_SKEW: f32 = 0.5;

/** O tempo está ligado (o mapa de cobertura traz o topo do estado no canal A e a bigorna no canal B). */
fn cloud_weather_on() -> bool {
    return clouds.weatherFlags.x != 0u;
}

/**
 * Cobertura, tipo, densidade relativa (com o tempo, a cobertura da bigorna) e a fração de altura do topo das nuvens na
 * casca no ponto horizontal `xz` (m): o mapa e, fora dele, os campos da cobertura e do tipo com o topo do tempo bom
 * (`clouds.weatherMap.x`; 1 sem o tempo) — e sem bigorna.
 */
fn cloud_coverage_at(xz: vec2f) -> vec4f {
    let m = clouds.coverageMap;
    let uv = (xz - m.xy) / m.z + 0.5;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
        let w = xz - clouds.coverageOffset.xy;
        return vec4f(
            cloud_coverage_field(w, clouds.layer.x, clouds.layer.y),
            cloud_type_field(w, clouds.layer.y),
            select(1.0, 0.0, cloud_weather_on()),
            clouds.weatherMap.x,
        );
    }
    return textureSampleLevel(cloud_coverage_tex, cloud_clamp_sampler, uv, 0.0);
}

/**
 * A fração de altura (na casca) acima da qual a coluna de cobertura `cov` não tem nuvem: o topo do estado (a torre só
 * chega lá na célula mais forte; é o teto) e, com bigorna, o topo da casca. 0 sem cobertura nem bigorna. É o que a
 * marcha usa para pular o vazio acima das nuvens (`cloud_integrate`).
 */
fn cloud_column_top(cov: vec4f) -> f32 {
    var top = select(0.0, cov.w, cov.x > 0.0);
    if (cloud_weather_on() && cov.z > 0.0) { top = 1.0; }
    return top;
}

/**
 * O teto da densidade relativa em qualquer ponto: a forma e a erosão só reduzem a cobertura local (`remap(base, 1 − cov,
 * 1)·cov ≤ cov` com `base ≤ 1`, e a erosão `(c − e)/(1 − e) ≤ c`). Sem função de cobertura nem tempo, a cobertura local é
 * `g(c, tipo) + 0,4·(u − 0,5)` com `u < 1` — o teto `g + 0,2` (mais um degrau do mapa de 8 bits); com função, 1; com o
 * tempo, a água da torre no máximo (`1 + CLOUD_WATER_GAIN`; a bigorna fica abaixo). É o majorante do rastreamento delta dos
 * caminhos do cache de espalhamento: com a cobertura 0,5, ~0,63 — 37 % menos colisões nulas, sem viés.
 */
fn cloud_density_bound() -> f32 {
    if (cloud_weather_on()) { return 1.0 + CLOUD_WATER_GAIN; }
    if (clouds.flags.w != 0u) { return 1.0; }
    let k = clamp(clouds.layer.y * 2.0, 0.0, 1.0);
    let g = mix(cloud_coverage_inverse(clouds.layer.x, true), cloud_coverage_inverse(clouds.layer.x, false), k);
    return clamp(g + 0.5 * CLOUD_COVERAGE_SPREAD + 1.0 / 255.0, 0.0, 1.0);
}

/**
 * A densidade da forma sem o detalhe (`detail` falso: a marcha grossa no vazio e a sombra longa) ou com a erosão
 * (`detail` verdadeiro).
 */
fn cloud_density(p: vec3f, detail: bool) -> f32 {
    return cloud_density_above(p, detail, -1.0);
}

/**
 * A pegada (m) do pixel da marcha no ponto que a vista amostra (`cloud_integrate` a escreve antes da amostra e a zera
 * depois; 0 nos outros usos: a luz, a sombra, os caminhos). Cada canal do detalhe com a oitava mais fina abaixo dela cede
 * ao canal mais grosso (`cloud_erode`).
 */
var<private> cloud_footprint: f32 = 0.0;

/**
 * O peso de um canal do detalhe cuja oitava mais fina tem células de `cell` metros na pegada `fp` (spec 041, R19): 1 com
 * a célula de duas pegadas ou mais, 0 com uma ou menos. O detalhe abaixo do pixel da marcha não se resolve: cada pixel
 * acerta ou erra um buraco de 28–56 m conforme o deslocamento, e com o tempo acelerado (24 m de vento por quadro) o padrão
 * muda antes da média temporal juntar — o grão das bordas ralas.
 */
fn cloud_detail_weight(cell: f32, fp: f32) -> f32 {
    return select(1.0, clamp(cell / fp - 1.0, 0.0, 1.0), fp > 0.0);
}

/**
 * A erosão das bordas pelo volume de detalhe na fração de altura local `hl`: os canais G, B e A (fBm de Worley com 4, 8 e
 * 16 células por período e três oitavas cada: a mais fina com o período/16, /32 e /64), cada um cedendo ao mais grosso
 * quando a oitava mais fina dele fica abaixo da pegada (`cloud_footprint`).
 */
fn cloud_erode(p: vec3f, c: f32, hl: f32, strength: f32) -> f32 {
    let pd = (p - clouds.detail.xyz) / clouds.detail.w;
    let d = textureSampleLevel(cloud_detail_tex, cloud_noise_sampler, pd, 0.0);
    let period = clouds.detail.w;
    let b = mix(d.g, d.b, cloud_detail_weight(period / 32.0, cloud_footprint));
    let a = mix(b, d.a, cloud_detail_weight(period / 64.0, cloud_footprint));
    let hf = d.g * 0.625 + b * 0.25 + a * 0.125;
    let hfm = mix(hf, 1.0 - hf, clamp(hl * 10.0, 0.0, 1.0));
    return max(0.0, cloud_remap(c, hfm * strength, 1.0, 0.0, 1.0));
}

/** O fBm de Worley da forma (os canais G, B e A do volume): as bolhas de 3 km, 1,5 km e 750 m no período de 12 km. */
fn cloud_shape_low(s: vec4f) -> f32 {
    return s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
}

/** A forma (sem erosão) da cobertura `cx` com a amostra `s` do volume e o perfil `profile`. */
fn cloud_shape_cover_sample(s: vec4f, cx: f32, profile: f32) -> f32 {
    let base = cloud_remap(s.r, cloud_shape_low(s) - 1.0, 1.0, 0.0, 1.0) * profile;
    if (cx < 1.0) { return cloud_remap(base, 1.0 - cx, 1.0, 0.0, 1.0) * cx; }
    return base;
}

/**
 * A força da erosão das bordas na coluna de topo local `top` com o topo do tempo bom `fair` (frações da casca; spec 041,
 * R19): `CLOUD_EROSION` nos cúmulos do tempo bom e nas torres; abaixo do topo do tempo bom (a subsidência baixa a
 * inversão), os cúmulos rasos ficam menores, não achatados — a largura de um cúmulo é da ordem da profundidade dele (Plank
 * 1969) —, e a erosão sobe com a fração perdida da profundidade, até `CLOUD_SHALLOW_EROSION`: o volume de detalhe (células
 * de 450 m, 225 m e 112 m) parte o corpo em cúmulos humildes. Sem isso, o perfil inteiro espremido em menos de 1 km sob a
 * inversão e a largura das células de 8 km da cobertura: panquecas lisas de 5–10 km de topo claro e base escura — os
 * discos achatados do vídeo `tempestade` da rodada 8. Sem o tempo o topo é o do tempo bom: `CLOUD_EROSION`.
 */
const CLOUD_SHALLOW_EROSION: f32 = 0.9;

fn cloud_shallow_erosion(top: f32, fair: f32) -> f32 {
    let lost = clamp(1.0 - top / max(fair, 1e-3), 0.0, 1.0);
    return mix(CLOUD_EROSION, CLOUD_SHALLOW_EROSION, smoothstep(0.0, 0.4, lost));
}

/** A forma (sem erosão) da cobertura `cx` no ponto `ps` do volume com o perfil `profile`. */
fn cloud_shape_cover(ps: vec3f, cx: f32, profile: f32) -> f32 {
    return cloud_shape_cover_sample(textureSampleLevel(cloud_shape_tex, cloud_noise_sampler, ps, 0.0), cx, profile);
}

/**
 * A densidade com a erosão só quando a da forma sem ela passa de `floor`: abaixo, devolve a da forma (≤ `floor`) sem ler
 * o volume de detalhe — a erosão só reduz, então o rastreamento delta decide a colisão nula pelo teste da forma. A torre e
 * a bigorna, cada uma com a sua regra; a densidade é a maior das duas (o mesmo ar).
 */
fn cloud_density_above(p: vec3f, detail: bool, floor: f32) -> f32 {
    let h = cloud_height_fraction(p);
    if (h <= 0.0 || h >= 1.0) { return 0.0; }
    let cov = cloud_coverage_at(p.xz);
    let weather = cloud_weather_on();
    var result = 0.0;
    if (cov.x > 0.0) {
        let skew = CLOUD_SKEW * clouds.shell.w * h;
        let ps = (p - clouds.shape.xyz - vec3f(clouds.wind.x * skew, 0.0, clouds.wind.y * skew)) / clouds.shape.w;
        // O topo local: o da casca sem o tempo; com ele, o do estado, que a torre só alcança na célula mais forte.
        let fair = clouds.weatherMap.x;
        var top = cov.w;
        var cx = cov.x;
        let tower = weather && top > fair;
        // A amostra da forma: antes do perfil na coluna da torre (as térmicas a usam), depois dele nas outras (o vazio
        // acima do topo não lê o volume).
        var s = vec4f(0.0);
        if (tower) {
            s = textureSampleLevel(cloud_shape_tex, cloud_noise_sampler, ps, 0.0);
            // As térmicas da torre (`cloud_tower_thermal`): o tipo e a cobertura locais acima do topo do tempo bom variam
            // com as bolhas do volume da forma — o topo e as paredes da torre em couve-flor, não o campo 2D extrudado.
            let th = cloud_tower_thermal(cloud_shape_low(s), clamp((h - fair) / (top - fair), 0.0, 1.0));
            top = fair + (top - fair) * cloud_tower_reach(cov.y + th.x);
            cx = clamp(cx + th.y, 0.0, 1.0);
        }
        // A fração de altura local: o perfil vai da base ao topo das nuvens no ponto, não ao da casca.
        let hl = select(h / max(top, 1e-3), h, top >= 1.0);
        let profile = select(0.0, cloud_height_profile(hl, cov.y), hl < 1.0);
        if (profile > 0.0 && cx > 0.0) {
            let alt = clouds.shell.y + h * clouds.shell.w;
            let k = cloud_tower_water(alt, clouds.shell.y + fair * clouds.shell.w) * select(max(cov.z, 0.0), 1.0, weather);
            if (!tower) { s = textureSampleLevel(cloud_shape_tex, cloud_noise_sampler, ps, 0.0); }
            let c = cloud_shape_cover_sample(s, cx, profile);
            if (c > 0.0) {
                if (!detail || c * k <= floor) {
                    result = c * k;
                } else {
                    result = cloud_erode(p, c, hl, select(CLOUD_EROSION, cloud_shallow_erosion(top, fair), weather)) * k;
                }
            }
        }
    }
    if (weather && cov.z > 0.0) {
        let alt = clouds.shell.y + h * clouds.shell.w;
        let profile = cloud_anvil_profile(alt, clouds.shell.z);
        if (profile > 0.0) {
            let pa = (p - vec3f(clouds.anvil.z, 0.0, clouds.anvil.w)) / clouds.shape.w;
            let c = cloud_shape_cover(pa, cov.z, profile);
            if (c > 0.0) {
                var a = c * CLOUD_ANVIL_WATER;
                if (detail && a > floor) { a = cloud_erode(p, c, 1.0, CLOUD_EROSION) * CLOUD_ANVIL_WATER; }
                result = max(result, a);
            }
        }
    }
    return result;
}
