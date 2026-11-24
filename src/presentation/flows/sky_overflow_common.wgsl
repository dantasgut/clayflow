// O disco do sol na tela (spec 041): a projeção, a direção pelo pixel e o centro e o raio do disco em pixels, para o
// excesso do disco (`sky_overflow`) e a fração visível dele (`sky_overflow_visibility`).
// Requer: cameras, view_space, sky_query, sky_overflow_depth.

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

/** O centro do disco e o raio dele em pixels (z < 0: atrás da câmera ou sem disco). */
fn sky_overflow_disk(size: vec2f) -> vec4f {
    let vp = cameras[sky.cameraSlot].unjitteredViewProjection;
    let sun = sky.sunDirection.xyz;
    let p = sky_overflow_project(vp, sun, size);
    if (sky.sunDisk == 0u || p.z < 0.0) { return vec4f(0.0, 0.0, -1.0, 0.0); }
    let r = sky.sunIlluminance.w;
    let a = normalize(select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(sun.y) > 0.9));
    let u = normalize(cross(sun, a));
    let v = cross(sun, u);
    let pu = sky_overflow_project(vp, sun * cos(r) + u * sin(r), size);
    let pv = sky_overflow_project(vp, sun * cos(r) + v * sin(r), size);
    return vec4f(p.xy, 1.0, max(length(pu.xy - p.xy), length(pv.xy - p.xy)));
}

