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
// Requer: cameras, view_space, sky, sky_sun_track_prev, sky_reactive_depth_tex.

/** Valores da máscara (a resolução temporal, `taa_reactive`): recortado como em movimento; recomeça. */
const SKY_REACTIVE_STIR: f32 = 0.5;
const SKY_REACTIVE_RESTART: f32 = 1.0;
/** Margem em pixels além do raio do disco: a vizinhança 3 × 3 da caixa (√2), o deslocamento da amostra e a borda. */
const SKY_REACTIVE_MARGIN: f32 = 3.0;

struct SkyReactiveOut {
    @builtin(position) clip: vec4f,
    /** Os centros dos dois discos em pixels (o de agora em xy, o anterior em zw). */
    @location(0) @interpolate(flat) centers: vec4f,
    /** O raio com a margem (pixels). */
    @location(1) @interpolate(flat) radius: f32,
}

/** O ponto no infinito na direção `dir` em pixels pela câmera, e se ele está à frente dela (w > 0). */
fn sky_reactive_project(vp: mat4x4f, dir: vec3f, size: vec2f) -> vec3f {
    let c = vp * vec4f(dir, 0.0);
    if (c.w <= 1e-6) { return vec3f(0.0, 0.0, -1.0); }
    let uv = ndc_to_uv(c.xy / c.w);
    return vec3f(uv * size, 1.0);
}

/** Raio do disco em pixels na direção `dir`: as duas bordas ortogonais projetadas (a perspectiva o alonga fora do centro). */
fn sky_reactive_radius(vp: mat4x4f, dir: vec3f, center: vec2f, size: vec2f) -> f32 {
    let r = sky.sunIlluminance.w;
    let a = normalize(select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(dir.y) > 0.9));
    let u = normalize(cross(dir, a));
    let v = cross(dir, u);
    let pu = sky_reactive_project(vp, dir * cos(r) + u * sin(r), size);
    let pv = sky_reactive_project(vp, dir * cos(r) + v * sin(r), size);
    return max(length(pu.xy - center), length(pv.xy - center));
}

@vertex
fn sky_reactive_vs(@builtin(vertex_index) vid: u32) -> SkyReactiveOut {
    let size = vec2f(textureDimensions(sky_reactive_depth_tex));
    let vp = cameras[sky.cameraSlot].unjitteredViewProjection;
    let now = sky.sunDirection.xyz;
    let stored = textureLoad(sky_sun_track_prev, vec2u(0u), 0);
    // Sem quadro anterior (a série recém-criada, a = 0): o de agora.
    let before = select(now, stored.xyz, stored.a > 0.5);
    let p0 = sky_reactive_project(vp, now, size);
    let p1 = sky_reactive_project(vp, before, size);
    var out: SkyReactiveOut;
    // Fora da tela (atrás da câmera ou sem disco): um triângulo degenerado.
    out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
    out.centers = vec4f(0.0);
    out.radius = 0.0;
    if (sky.sunDisk == 0u || p0.z < 0.0 || p1.z < 0.0) { return out; }
    let radius = max(sky_reactive_radius(vp, now, p0.xy, size), sky_reactive_radius(vp, before, p1.xy, size))
        + SKY_REACTIVE_MARGIN;
    let lo = min(p0.xy, p1.xy) - radius;
    let hi = max(p0.xy, p1.xy) + radius;
    // Dois triângulos do retângulo (0 1 2, 2 1 3).
    var corners = array<vec2f, 6>(
        vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
        vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    );
    let corner = corners[vid % 6u];
    let px = mix(lo, hi, corner);
    out.clip = vec4f(uv_to_ndc(px / size), 0.0, 1.0);
    out.centers = vec4f(p0.xy, p1.xy);
    out.radius = radius;
    return out;
}

@fragment
fn sky_reactive_fs(in: SkyReactiveOut) -> @location(0) vec4f {
    // Só o fundo (onde nada foi desenhado): a superfície tem o vetor de movimento dela.
    if (textureLoad(sky_reactive_depth_tex, vec2i(in.clip.xy), 0) < 1.0) { discard; }
    if (length(in.clip.xy - in.centers.xy) <= in.radius) { return vec4f(SKY_REACTIVE_STIR, 0.0, 0.0, 1.0); }
    if (length(in.clip.xy - in.centers.zw) <= in.radius) { return vec4f(SKY_REACTIVE_RESTART, 0.0, 0.0, 1.0); }
    discard;
    return vec4f(0.0);
}
