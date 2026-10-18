// Tabela da vista do céu (spec 033, R4; Hillaire 2020, §5.3): por direção de vista na parametrização não linear em
// torno do horizonte, o espalhamento simples (Rayleigh e Mie com a transmitância até o sol) mais o múltiplo (Ψms), por
// unidade de iluminância do sol, vistos da altitude do observador — 32 passos em distribuição quadrática — e, abaixo do
// horizonte, o chão do planeta iluminado pelo sol. Regerada a cada quadro (o sol se move).
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, sky_atmosphere, sky_lookup, sky, sky_view_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn sky_view_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(sky_view_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let texel = vec2u(i % size.x, i / size.x);
    let uv = (vec2f(texel) + 0.5) / vec2f(size);
    let r = sky_bottom() + max(sky.radii.w, 0.001);
    let angles = sky_view_angles(uv, r);
    // Sol no plano x-y; a vista com o azimute relativo a ele.
    let sun_zenith_cos = clamp(sky.sunDirection.y, -1.0, 1.0);
    let sun = vec3f(sqrt(max(0.0, 1.0 - sun_zenith_cos * sun_zenith_cos)), sun_zenith_cos, 0.0);
    let sz = sin(angles.x);
    let view = vec3f(sz * cos(angles.y), cos(angles.x), sz * sin(angles.y));
    let pos = vec3f(0.0, r, 0.0);
    let seg = sky_segment(r, view.y);
    let steps = 32.0;
    let c = dot(view, sun);
    let pr = sky_rayleigh_phase(c);
    let pm = sky_mie_phase(c);
    var throughput = vec3f(1.0);
    var lum = vec3f(0.0);
    for (var i = 0.0; i < steps; i += 1.0) {
        // Passos quadráticos (Hillaire 2020): mais amostras perto do observador, onde ficam os aerossóis.
        let t0 = seg * (i / steps) * (i / steps);
        let t1 = seg * ((i + 1.0) / steps) * ((i + 1.0) / steps);
        let dt = t1 - t0;
        let x = pos + view * (t0 + dt * 0.5);
        let rx = length(x);
        let m = sky_medium(rx - sky_bottom());
        let step_t = exp(-m.extinction * dt);
        let integ = select(vec3f(dt), (1.0 - step_t) / max(m.extinction, vec3f(1e-12)), m.extinction > vec3f(0.0));
        let mu_s = dot(x, sun) / rx;
        let single = (m.rayleigh * pr + vec3f(m.mie * pm)) * sky_transmittance(rx, mu_s);
        let multi = m.scattering * sky_multiscatter(rx, mu_s);
        lum += throughput * (single + multi) * integ;
        throughput *= step_t;
    }
    // Abaixo do horizonte, o chão do planeta iluminado pelo sol (Lambert, albedo do chão), atenuado até o observador.
    if (sky_hits_ground(r, view.y)) {
        let x = pos + view * seg;
        let n = normalize(x);
        let mu_s = dot(n, sun);
        lum += throughput * sky_transmittance(sky_bottom(), mu_s) * sky.ground.rgb * max(mu_s, 0.0) / SKY_PI;
    }
    textureStore(sky_view_out, texel, vec4f(lum, 1.0));
}
