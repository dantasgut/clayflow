// Máscara reativa do disco do sol (spec 041; como a "responsive AA" da Unreal e a máscara reativa do FSR 2): o disco
// anda no fundo sem vetor de movimento, e o histórico parado da resolução temporal (64 quadros, sem recorte) guardava
// por onde ele passou — um rastro claro ao longo do caminho do sol. Nos pixels do fundo onde o disco está neste quadro
// ou estava no anterior (a série `Sky.sunTrack`, spec 037), com uma margem: sobre o disco de agora, o histórico é tratado
// como em movimento (recortado pela caixa da vizinhança, o quadro novo entrando depressa), sem recomeçar — as nuvens na
// frente do disco seguem acumulando; onde só o disco anterior estava (o que ele acabou de deixar), o histórico recomeça
// (o recorte deixava ali o resto da caixa, 2–3 níveis de 8 bits que o histórico parado guardava). Por indução, todo
// pixel por onde o disco passou recomeça no quadro seguinte; a margem cobre a vizinhança 3 × 3 da caixa e o deslocamento
// da amostra. Um retângulo em volta dos dois discos (o vértice projeta as duas direções pela câmera sem o
// deslocamento), o fragmento só no fundo.
// Atrás das nuvens (spec 041): o disco que a nuvem tapa não deixa rastro no histórico; a máscara só onde a luz do disco
// que passa pelas nuvens pesa no pixel (`SKY_REACTIVE_SHARE`). (O traço vertical na nuvem acima do sol no `solposto` era
// outra coisa: o histórico das nuvens sem reiluminação — ver `sky_composite.wgsl`.)
// Funções comuns ao passe de desenho (`sky_reactive_draw.wgsl`) e ao de compute por blocos (`sky_reactive_tiles.wgsl`).
// Requer: cameras, view_space, color, sky, sky_sun_track_prev, sky_reactive_depth_tex, sky_disk_cover.

/** Valores da máscara (a resolução temporal, `taa_reactive`): recortado como em movimento; recomeça. */
const SKY_REACTIVE_STIR: f32 = 0.5;
const SKY_REACTIVE_RESTART: f32 = 1.0;
/** Margem em pixels além do raio do disco: a vizinhança 3 × 3 da caixa (√2), o deslocamento da amostra e a borda. */
const SKY_REACTIVE_MARGIN: f32 = 3.0;
/** A fração do pixel que a luz do disco atrás das nuvens precisa ter para recomeçar: abaixo, o rastro some na média. */
const SKY_REACTIVE_SHARE: f32 = 1.0 / 64.0;

/** O ponto no infinito na direção `dir` em pixels pela câmera, e se ele está à frente dela (w > 0). */
fn sky_reactive_project(vp: mat4x4f, dir: vec3f, size: vec2f) -> vec3f {
    let c = vp * vec4f(dir, 0.0);
    if (c.w <= 1e-6) { return vec3f(0.0, 0.0, -1.0); }
    let uv = ndc_to_uv(c.xy / c.w);
    return vec3f(uv * size, 1.0);
}

/** Raio em pixels do círculo de raio angular `r` em volta da direção `dir`: as duas bordas ortogonais projetadas (a perspectiva o alonga fora do centro). */
fn sky_reactive_radius(vp: mat4x4f, dir: vec3f, center: vec2f, size: vec2f, r: f32) -> f32 {
    let a = normalize(select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(dir.y) > 0.9));
    let u = normalize(cross(dir, a));
    let v = cross(dir, u);
    let pu = sky_reactive_project(vp, dir * cos(r) + u * sin(r), size);
    let pv = sky_reactive_project(vp, dir * cos(r) + v * sin(r), size);
    return max(length(pu.xy - center), length(pv.xy - center));
}

/** Os dois discos na tela: os centros em pixels (o de agora em xy, o anterior em zw) e o raio com a margem (`r`, < 0 sem disco). */
struct SkyReactiveDisks {
    centers: vec4f,
    radius: f32,
}

/** Os discos de agora e do quadro anterior (a série `Sky.sunTrack`) pela câmera sem o deslocamento, na tela `size`. */
fn sky_reactive_disks(size: vec2f) -> SkyReactiveDisks {
    let vp = cameras[sky.cameraSlot].unjitteredViewProjection;
    let now = sky.sunDirection.xyz;
    let stored = textureLoad(sky_sun_track_prev, vec2u(0u), 0);
    // Sem quadro anterior (a série recém-criada, a = 0): o de agora.
    let before = select(now, stored.xyz, stored.a > 0.5);
    let p0 = sky_reactive_project(vp, now, size);
    let p1 = sky_reactive_project(vp, before, size);
    // Fora da tela (atrás da câmera) ou sem disco: nenhum.
    if (sky.sunDisk == 0u || p0.z < 0.0 || p1.z < 0.0) { return SkyReactiveDisks(vec4f(0.0), -1.0); }
    let r = sky.sunIlluminance.w;
    let radius = max(sky_reactive_radius(vp, now, p0.xy, size, r), sky_reactive_radius(vp, before, p1.xy, size, r))
        + SKY_REACTIVE_MARGIN;
    return SkyReactiveDisks(vec4f(p0.xy, p1.xy), radius);
}

/**
 * O valor da máscara no pixel `px` (o centro em `at`) do fundo com os discos `d`: `SKY_REACTIVE_STIR` sobre o de agora,
 * `SKY_REACTIVE_RESTART` onde só o anterior estava, 0 fora deles, fora do fundo ou onde a luz do disco que passa pelas
 * nuvens não pesa no pixel.
 */
fn sky_reactive_mark(px: vec2u, at: vec2f, d: SkyReactiveDisks) -> f32 {
    // Só o fundo (onde nada foi desenhado): a superfície tem o vetor de movimento dela.
    if (textureLoad(sky_reactive_depth_tex, vec2i(px), 0) < 1.0) { return 0.0; }
    let now = length(at - d.centers.xy);
    let before = length(at - d.centers.zw);
    if (now > d.radius && before > d.radius) { return 0.0; }
    // A luz do disco que passa pelas nuvens no pixel contra a luz delas.
    let cover = sky_disk_cover(px);
    let r = sky.sunIlluminance.w;
    let disk = luminance(min(sky.sunIlluminance.rgb * sky_sun_transmittance(vec3f(0.0)) / (PI * r * r), vec3f(SKY_SUN_DISK_MAX)))
        * cover.a;
    if (disk < SKY_REACTIVE_SHARE * (disk + luminance(cover.rgb))) { return 0.0; }
    return select(SKY_REACTIVE_RESTART, SKY_REACTIVE_STIR, now <= d.radius);
}
