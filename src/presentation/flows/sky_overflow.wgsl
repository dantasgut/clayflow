// O disco do sol acima do teto da cor (spec 041): a radiância física do disco (a iluminância do sol atenuada pela
// atmosfera / o ângulo sólido dele, ~10⁹ nits ao meio dia) passa do teto do alvo meio-float (o fundo guarda
// `SKY_SUN_DISK_MAX`); o excesso vai para `FrameTargets.overflow` (em unidades de `OVERFLOW_UNIT`), que o espalhamento da
// lente (o `Bloom`) soma — o clarão em volta do sol tem a energia inteira dele. Um retângulo em volta do disco (o vértice
// projeta a direção do sol pela câmera sem o deslocamento da amostra); o fragmento só no fundo, com a cobertura do pixel
// pelo disco (a borda pela distância angular sobre o tamanho do pixel: a energia não depende do deslocamento da amostra),
// atenuado pela névoa dos volumes na frente do fundo (`scene_fog`) e pelas nuvens no pixel (`sky_disk_cover`).
// Requer: cameras, view_space, sky_query, scene_fog, SCENE_FOG_BACKGROUND, OVERFLOW_UNIT, sky_overflow_depth,
// sky_disk_cover.

/** Margem em pixels além do raio do disco (a borda suavizada). */
const SKY_OVERFLOW_MARGIN: f32 = 2.0;

struct SkyOverflowOut {
    @builtin(position) clip: vec4f,
    @location(0) @interpolate(flat) center: vec2f,
    @location(1) @interpolate(flat) radius: f32,
}

/** O ponto no infinito na direção `dir` em pixels pela câmera, e se ele está à frente dela (w > 0). */
fn sky_overflow_project(vp: mat4x4f, dir: vec3f, size: vec2f) -> vec3f {
    let c = vp * vec4f(dir, 0.0);
    if (c.w <= 1e-6) { return vec3f(0.0, 0.0, -1.0); }
    return vec3f(ndc_to_uv(c.xy / c.w) * size, 1.0);
}

/** A direção do raio sem deslocamento pelo pixel `px` (coordenadas de pixel, contínuas). */
fn sky_overflow_dir(px: vec2f, size: vec2f) -> vec3f {
    let cam = cameras[sky.cameraSlot];
    let ndc = uv_to_ndc(px / size);
    let far = cam.inverseUnjitteredViewProjection * vec4f(ndc, 1.0, 1.0);
    let near = cam.inverseUnjitteredViewProjection * vec4f(ndc, 0.0, 1.0);
    return normalize(far.xyz / far.w - near.xyz / near.w);
}

@vertex
fn sky_overflow_vs(@builtin(vertex_index) vid: u32) -> SkyOverflowOut {
    let size = vec2f(sky_overflow_depth_size());
    let vp = cameras[sky.cameraSlot].unjitteredViewProjection;
    let sun = sky.sunDirection.xyz;
    let p = sky_overflow_project(vp, sun, size);
    var out: SkyOverflowOut;
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    out.center = vec2f(0.0);
    out.radius = 0.0;
    if (sky.sunDisk == 0u || p.z < 0.0) { return out; }
    // O raio do disco em pixels: a borda projetada (a perspectiva o alonga fora do centro, por isso as duas bordas).
    let r = sky.sunIlluminance.w;
    let a = normalize(select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(sun.y) > 0.9));
    let u = normalize(cross(sun, a));
    let v = cross(sun, u);
    let pu = sky_overflow_project(vp, sun * cos(r) + u * sin(r), size);
    let pv = sky_overflow_project(vp, sun * cos(r) + v * sin(r), size);
    let radius = max(length(pu.xy - p.xy), length(pv.xy - p.xy)) + SKY_OVERFLOW_MARGIN;
    var corners = array<vec2f, 6>(
        vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
        vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    );
    let px = mix(p.xy - radius, p.xy + radius, corners[vid % 6u]);
    out.clip = vec4f(uv_to_ndc(px / size), 0.0, 1.0);
    out.center = p.xy;
    out.radius = radius;
    return out;
}

@fragment
fn sky_overflow_fs(in: SkyOverflowOut) -> @location(0) vec4f {
    let px = vec2i(in.clip.xy);
    // Só o fundo (onde nada foi desenhado): o que está na frente do sol o tapa.
    if (sky_overflow_depth(px) < 1.0) { discard; }
    let size = vec2f(sky_overflow_depth_size());
    let dir = sky_overflow_dir(in.clip.xy, size);
    let side = sky_overflow_dir(in.clip.xy + vec2f(1.0, 0.0), size);
    let pixel = max(acos(clamp(dot(dir, side), -1.0, 1.0)), 1e-7);
    let angle = acos(clamp(dot(dir, sky.sunDirection.xyz), -1.0, 1.0));
    let cover = clamp((sky.sunIlluminance.w - angle) / pixel + 0.5, 0.0, 1.0);
    if (cover <= 0.0) { discard; }
    // A radiância do disco (a do fundo) e o que passa do teto que o fundo guarda.
    let radius = sky.sunIlluminance.w;
    let disk = sky.sunIlluminance.rgb * sky_sun_transmittance(vec3f(0.0)) / (PI * radius * radius);
    let excess = max(disk - vec3f(SKY_SUN_DISK_MAX), vec3f(0.0));
    let cam = cameras[sky.cameraSlot];
    let fog = scene_fog(cam.position.xyz + dir * SCENE_FOG_BACKGROUND);
    let clouds = sky_disk_cover(vec2u(px)).a;
    return vec4f(excess * cover * fog.transmittance * clouds / OVERFLOW_UNIT, 1.0);
}
