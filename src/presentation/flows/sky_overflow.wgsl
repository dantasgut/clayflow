// O disco do sol acima do teto da cor (spec 041): a radiância física do disco (a iluminância do sol atenuada pela
// atmosfera / o ângulo sólido dele, ~10⁹ nits ao meio dia) passa do teto do alvo meio-float (o fundo guarda
// `SKY_SUN_DISK_MAX`); o excesso vai para `FrameTargets.overflow` (em unidades de `OVERFLOW_UNIT`), que o espalhamento da
// lente (o `Bloom`) soma — o clarão em volta do sol tem a energia inteira dele. Um retângulo em volta do disco (o vértice
// projeta a direção do sol pela câmera sem o deslocamento da amostra); o fragmento só no fundo, com a cobertura do pixel
// pelo disco (a borda pela distância angular sobre o tamanho do pixel: a energia não depende do deslocamento da amostra),
// atenuado pela névoa dos volumes na frente do fundo (`scene_fog`) e pela fração visível do disco (`sky_sun_visibility`).
// A fração visível (`sky_overflow_visibility_main`, um grupo): a média, em 8 × 8 pontos do disco, do fundo (a profundidade
// no plano distante) × a transmitância das nuvens no pixel, acumulada pela série `Sky.sunVisibility` (spec 037) com o peso
// `SKY_OVERFLOW_VISIBILITY_BLEND` — como a cor na resolução temporal. Pixel a pixel, a energia do disco (até ~25 000 × o
// teto) seguia o deslocamento da amostra na silhueta do relevo e o ruído da marcha das nuvens: o clarão piscava (o
// `pordosol`, quadros 276–277: 16 níveis, 6,7 % da imagem alternando).
// Requer: sky_overflow_common, scene_fog, SCENE_FOG_BACKGROUND, OVERFLOW_UNIT, sky_sun_visibility.

/** Margem em pixels além do raio do disco (a borda suavizada). */
const SKY_OVERFLOW_MARGIN: f32 = 2.0;

struct SkyOverflowOut {
    @builtin(position) clip: vec4f,
    @location(0) @interpolate(flat) center: vec2f,
    @location(1) @interpolate(flat) radius: f32,
}

@vertex
fn sky_overflow_vs(@builtin(vertex_index) vid: u32) -> SkyOverflowOut {
    let size = vec2f(sky_overflow_depth_size());
    let disk = sky_overflow_disk(size);
    var out: SkyOverflowOut;
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    out.center = vec2f(0.0);
    out.radius = 0.0;
    if (disk.z < 0.0) { return out; }
    let p = disk.xy;
    let radius = disk.w + SKY_OVERFLOW_MARGIN;
    var corners = array<vec2f, 6>(
        vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
        vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    );
    let px = mix(p - radius, p + radius, corners[vid % 6u]);
    out.clip = vec4f(uv_to_ndc(px / size), 0.0, 1.0);
    out.center = p;
    out.radius = radius;
    return out;
}

@fragment
fn sky_overflow_fs(in: SkyOverflowOut) -> @location(0) vec4f {
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
    let visible = textureLoad(sky_sun_visibility, vec2u(0u), 0).r;
    return vec4f(excess * cover * fog.transmittance * visible / OVERFLOW_UNIT, 1.0);
}
