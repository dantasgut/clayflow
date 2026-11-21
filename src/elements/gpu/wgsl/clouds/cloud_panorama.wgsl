// Panorama das nuvens (spec 041, R12): a esfera de direções em latitude-longitude vista da posição da câmera
// (`clouds.eye`), cada texel marchado com o orçamento do panorama (`clouds.timing.y` passos, 3 de luz) e a perspectiva
// aérea até a nuvem pelas tabelas da atmosfera (`sky_aerial_far`): a luz espalhada (rgb) e a transmitância (a). Lido
// pelo ponto `sky_cover` (o céu dos raios que escapam: a refração, o reflexo na água, as sondas da GI). Série por páginas
// da 037 (uma página, o alvo inteiro; T074): refeito inteiro no quadro em que a escolha do cache o marca
// (`cloud_scatter_panorama_redo`: a série que não vale, outro conteúdo, a mudança medida); senão, segue o que está, e
// a cada `CLOUD_PANORAMA_PROBE_PERIOD` quadros `CLOUD_SCATTER_PANORAMA_PROBES` texels sorteados são refeitos como o
// desenho os faria agora (as provas: a luminância e a transmitância, nas globais do cache) — a escolha do quadro seguinte
// os compara com o desenho guardado.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, constants, random, color, cloud_light, sky_aerial_lookup, clouds, cloud_panorama_out,
// cloud_scatter_pages, cloud_scatter_work, cloud_panorama_stamps, cloud_panorama_clock.

/** A palavra do trabalho do cache com o panorama a refazer (`CLOUD_SCATTER_WORK_PANORAMA`). */
const CLOUD_PANORAMA_WORK: u32 = 1u;
/**
 * Quadros entre duas rodadas de provas (as do mapa visto do sol: `CLOUD_SHADOW_PROBE_PERIOD`): a marcha de um texel do
 * panorama tem a latência do desenho inteiro (os 32 passos em série), e 64 texels custavam no quadro o mesmo que os 32 768.
 */
const CLOUD_PANORAMA_PROBE_PERIOD: u32 = 8u;

/** O texel `g` do panorama de `size` texels: a luz espalhada e a transmitância. */
fn cloud_panorama_texel(g: vec2u, size: vec2u) -> vec4f {
    let uv = (vec2f(g) + 0.5) / vec2f(size);
    let phi = uv.x * 2.0 * PI;
    let theta = uv.y * PI;
    let dir = vec3f(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
    let s = cloud_integrate(clouds.eye.xyz, dir, 1e30, u32(clouds.timing.y), 3u, 0.5, 0.0);
    var color = s.scattered;
    if (s.transmittance < 1.0) {
        let a = sky_aerial_far(dir, 0.0, SkyAerial(vec3f(0.0), vec3f(1.0)), s.depth * 0.001);
        color = color * a.transmittance + (1.0 - s.transmittance) * a.scattered * sky.sunIlluminance.rgb;
    }
    return vec4f(color, s.transmittance);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_panorama_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_panorama_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let n = size.x * size.y;
    if (i >= n) { return; }
    if (atomicLoad(&cloud_scatter_work[CLOUD_PANORAMA_WORK]) == 0u) {
        // As provas: a cada `CLOUD_PANORAMA_PROBE_PERIOD` quadros, texels sorteados (outros a cada vez), refeitos e gravados
        // para a escolha seguinte; nos outros quadros, nada (a escolha não as relê: a contagem zera depois de lidas).
        if (i >= CLOUD_SCATTER_PANORAMA_PROBES || clouds.scatterWork.z % CLOUD_PANORAMA_PROBE_PERIOD != 0u) { return; }
        let t = pcg_hash(i * 0x9e3779b9u + clouds.scatterWork.z * 0x85ebca6bu) % n;
        let v = cloud_panorama_texel(vec2u(t % size.x, t / size.x), size);
        let w = CLOUD_SCATTER_G_PROBES + i * 3u;
        atomicStore(&cloud_scatter_cache[w], t);
        atomicStore(&cloud_scatter_cache[w + 1u], bitcast<u32>(max(luminance(v.rgb), 0.0)));
        atomicStore(&cloud_scatter_cache[w + 2u], bitcast<u32>(v.a));
        if (i == 0u) { atomicStore(&cloud_scatter_cache[CLOUD_SCATTER_G_PROBE_COUNT], CLOUD_SCATTER_PANORAMA_PROBES); }
        return;
    }
    let g = vec2u(i % size.x, i / size.x);
    // O carimbo da página única: escrita na época atual; o desenho do quadro é o que as provas comparam (nenhuma prova).
    if (i == 0u) {
        cloud_panorama_stamps[0] = cloud_panorama_clock.x;
        atomicStore(&cloud_scatter_cache[CLOUD_SCATTER_G_PROBE_COUNT], 0u);
    }
    textureStore(cloud_panorama_out, g, cloud_panorama_texel(g, size));
}
