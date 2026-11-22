// Luz das nuvens (spec 041, R1, R7–R9): num ponto com densidade, a profundidade ótica até o sol — o cone
// curto de 6 passos crescentes × 1,5 (Schneider 2015; o crescimento × 2 dele dava trechos de 16 passos base em que o
// ponto médio erra a borda da nuvem: −3 % de luz na mediana, medido) e, além dele, o mapa visto do sol (τ, nunca
// refeito de T: as oitavas usam `e^(−aⁱτ)` com τ de dezenas sob o sol baixo) —, o
// espalhamento múltiplo por oitavas (Wrenninge 2013: `Σ bⁱ σs e^(−aⁱ τ) p(cⁱ g)`), a luz do sol atenuada pela atmosfera
// até o ponto e o ambiente do céu (em cima) e do chão (embaixo) pela fração de altura. Teto constante de passos de luz
// (`CLOUD_MAX_LIGHT_STEPS`) e do pedaço até o nó do mapa (`CLOUD_SHADOW_PARTIAL_STEPS`, `cloud_sun_rest`); com o volume
// de τ até o sol (T074), uma amostra do cone e uma leitura do volume. Quem a chama: a marcha (`cloud_integrate.wgsl`,
// pelo ponto `cloud_sample_light`) e o passe da luz das amostras da marcha da tela (`cloud_light_samples.wgsl`).
// Espelho da luz de `marchCloud` em `cloudModel.ts`.
// Requer: cloud_common, cloud_sun, cloud_density, cloud_phase, cloud_shadow_lookup, cloud_scatter_lookup,
// cloud_sun_rest, cloud_sun_volume_lookup, sky_query, clouds, cloud_ambient_tex.

const CLOUD_MAX_LIGHT_STEPS: u32 = 6u;
const CLOUD_MAX_OCTAVES: u32 = 3u;

/**
 * Profundidade ótica da nuvem de `p` até o sol: o cone curto; do fim dele, o pedaço do trecho do mapa até o nó do lado
 * do sol, integrado aqui (`CLOUD_SHADOW_PARTIAL_STEPS` passos, `cloud_sun_rest`); e o nó, lido do mapa (a integral da
 * coluna da entrada da casca até ele). Medido em f64 com o sol a 4° (luz do sol por região contra τ exato): 16 nós com a
 * marcha do pedaço erram ≤ 2,2 %; 16 nós lineares, até 14 %; 4 nós lineares, até 50 %.
 * Perto da câmera (T074), o cone além da primeira amostra pelo volume de τ até o sol (`cloud_sun_volume_at`: os nós a
 * 50 m, refeitos pela mudança medida), onde a página dele vale e os passos são os do volume (os da marcha do perfil): em
 * f64, 2,4–3,0 % de erro no τ do cone contra 3,7 % das 6 amostras (`cloudSunVolume.test.ts`), com uma amostra da
 * densidade e oito leituras do volume no lugar de seis amostras.
 */
fn cloud_sun_depth(p: vec3f, light_steps: u32) -> f32 {
    let sun = sky.sunDirection.xyz;
    let base = cloud_layer_thickness() / 48.0;
    let n = min(light_steps, CLOUD_MAX_LIGHT_STEPS);
    // O volume (os passos dele são os da marcha do perfil): a primeira amostra do cone no ponto (a borda escura, que os
    // nós alisariam) e o resto do cone pelos nós; o resto da luz também, onde ele vale.
    var volume = vec3f(-1.0, -1.0, 0.0);
    if (light_steps == clouds.march.y) {
        volume = cloud_sun_volume_at(p + sun * clouds.sunVolume.z, cloud_light_footprint);
    }
    let d0 = clouds.sunVolume.z;
    if (volume.x >= 0.0 && volume.z >= 1.0) {
        let tau = cloud_density(p + sun * (0.5 * d0), true) * d0 * clouds.layer.z + volume.x;
        if (volume.y >= 0.0) { return tau + volume.y; }
        return tau + cloud_sun_rest(p + sun * (d0 + clouds.sunVolume.y), n);
    }
    var rho = 0.0;
    var t = 0.0;
    for (var i = 0u; i < CLOUD_MAX_LIGHT_STEPS; i++) {
        if (i >= n) { break; }
        let len = base * 0.5 * pow(1.5, f32(i));
        rho += cloud_density(p + sun * (t + 0.5 * len), true) * len;
        t += len;
    }
    var tau = rho * clouds.layer.z;
    // No anel de fora do último nível (ou com a página seguinte que não vale), o volume sai aos poucos para o cone.
    if (volume.x >= 0.0) {
        let near = cloud_density(p + sun * (0.5 * d0), true) * d0 * clouds.layer.z + volume.x;
        tau = mix(tau, near, volume.z);
    }
    return tau + cloud_sun_rest(p + sun * t, n);
}

/**
 * A transmitância difusa de uma camada de profundidade ótica `tau` sem absorção (duas correntes, Eddington: Bohren 1987,
 * `1/(1 + ¾(1 − g)τ)`, g o parâmetro de assimetria das gotículas): a fração da luz difusa que atravessa a nuvem.
 */
const CLOUD_DIFFUSE_ASYMMETRY: f32 = 0.85;

fn cloud_diffuse_transmittance(tau: f32) -> f32 {
    return 1.0 / (1.0 + 0.75 * (1.0 - CLOUD_DIFFUSE_ASYMMETRY) * tau);
}

/**
 * O ambiente local da estimativa das oitavas em `p` (spec 041, R19): o céu (em cima) e o chão (embaixo) pela fração de
 * altura, atenuados pela própria nuvem: pela maior das transmitâncias difusas da coluna acima do ponto e do caminho até
 * o sol (`tau_sun`, já calculado: a parede da torre vê o céu e o chão de lado; a coluna, a luz que passa por cima). A
 * coluna (`cloud_ambient_occlusion`): a cobertura local × o trecho até o topo da coluna, lida na primeira amostra com
 * densidade de cada raio e a cada `CLOUD_AMBIENT_REUSE` depois (a coluna muda devagar ao longo do raio; com 5 amostras e
 * o chão pelo mapa visto do sol, o perfil alto passava de 3 ms). Sem a oclusão, a base de um cúmulo-nimbo de 10 km
 * recebia o céu inteiro na estimativa, que pesa ≥ 20 % contra os caminhos das sondas (`CLOUD_SCATTER_PRIOR` em 64 + 16):
 * a base cinza, não chumbo. Espelho de `ambientLocal` em `cloudModel.ts`.
 */
const CLOUD_AMBIENT_REUSE: u32 = 8u;

/**
 * A transmitância difusa da coluna de nuvem acima de `p`: a profundidade ótica pela cobertura local do mapa (a fração do
 * ar com nuvem na coluna, o campo liso de 250 m) do ponto ao topo da coluna. Uma amostra do volume no meio do trecho
 * acertava ou errava os buracos da forma de uma coluna à outra: manchas de 1 km na base do cúmulo-nimbo.
 */
fn cloud_ambient_occlusion(p: vec3f) -> f32 {
    let cov = cloud_coverage_at(p.xz);
    let top = clouds.shell.y + cloud_column_top(cov) * clouds.shell.w;
    let above = max(top - cloud_altitude(p), 0.0);
    return cloud_diffuse_transmittance(max(cov.x, 0.0) * above * clouds.layer.z);
}

fn cloud_ambient_local(p: vec3f, tau_sun: f32, occ: f32) -> vec3f {
    let h = clamp(cloud_height_fraction(p), 0.0, 1.0);
    let up = textureLoad(cloud_ambient_tex, vec2u(0u, 0u), 0).rgb;
    let down = textureLoad(cloud_ambient_tex, vec2u(1u, 0u), 0).rgb;
    return (up * h + down * (1.0 - h)) * max(occ, cloud_diffuse_transmittance(tau_sun));
}

/**
 * Luz espalhada para a câmera em `p` por unidade de profundidade ótica (o sol e o ambiente; × a extinção, a luz por
 * unidade de comprimento). `occ` é a coluna do ambiente local (`cloud_ambient_occlusion`); a pegada do pixel da marcha no
 * ponto vem em `cloud_light_footprint`.
 */
fn cloud_radiance(p: vec3f, cos_theta: f32, light_steps: u32, occ: f32) -> vec3f {
    let tau = cloud_sun_depth(p, light_steps);
    let o = clouds.octaves;
    let count = min(u32(o.x), CLOUD_MAX_OCTAVES);
    // A oitava 0 é o espalhamento simples exato; as demais e o ambiente local são a estimativa a que a luz das sondas do
    // cache de espalhamento (o transporte completo por caminhos, T023) se sobrepõe à medida que os caminhos chegam.
    // O feixe do sol no ponto: o não desviado e o desviado menos de 2° pelo pico de frente (δ-M), `e^(−(1 − ω·fc)τ)` — a
    // luz que os caminhos das sondas não alcançam (o pico é transmitido neles).
    let single = exp(-(1.0 - clouds.layer.w * clouds.phaseCut.y) * tau) * cloud_phase(cos_theta, 1.0);
    var s = 0.0;
    var energy = o.z;
    var attenuation = o.y;
    var anisotropy = o.w;
    for (var i = 1u; i < CLOUD_MAX_OCTAVES; i++) {
        if (i >= count) { break; }
        s += energy * exp(-attenuation * tau) * cloud_phase(cos_theta, anisotropy);
        energy *= o.z;
        attenuation *= o.y;
        anisotropy *= o.w;
    }
    let atm = cloud_sun_atmosphere(p);
    let sun = sky.sunIlluminance.rgb * atm;
    let multiple = cloud_scatter_light(p, s * sun + cloud_ambient_local(p, tau, occ), atm);
    return clouds.layer.w * (single * sun + multiple);
}

/**
 * A espessura (m) da camada que dita o passo da marcha e o cone da luz: a do tempo bom (o topo e a base da camada; sem o
 * tempo, a casca). Com o tempo a casca vai à tropopausa, mas os cúmulos rasos têm a escala de antes: o passo pela casca
 * inteira (153 m numa de 9,8 km, contra 25 m) amostrava as bordas finas com 6 × menos passos (o grão da `tempestade`).
 */
fn cloud_layer_thickness() -> f32 {
    return clouds.shell.w * clouds.weatherMap.x;
}
