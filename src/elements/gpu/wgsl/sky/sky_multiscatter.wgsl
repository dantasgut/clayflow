// Tabela de múltiplo espalhamento (spec 033, R4; Hillaire 2020, §5.5): por (cosseno zenital do sol, altura), a luz de
// segunda ordem isotrópica L2 somada como série geométrica de razão fms — 64 direções em espiral de Fibonacci, 20
// passos cada, com o chão refletindo o sol (albedo). Gerada depois da transmitância, quando os parâmetros mudam.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, sky_atmosphere, sky_lookup, sky, sky_multiscatter_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn sky_multiscatter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(sky_multiscatter_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let texel = vec2u(i % size.x, i / size.x);
    let uv = (vec2f(texel) + 0.5) / vec2f(size);
    let mu_s = uv.x * 2.0 - 1.0;
    let r = sky_bottom() + uv.y * (sky_top() - sky_bottom()) + 1e-3;
    let pos = vec3f(0.0, r, 0.0);
    let sun = vec3f(sqrt(max(0.0, 1.0 - mu_s * mu_s)), mu_s, 0.0);
    let dirs = 64.0;
    let steps = 20.0;
    let isotropic = 1.0 / (4.0 * PI);
    var l2 = vec3f(0.0);
    var fms = vec3f(0.0);
    for (var k = 0.0; k < dirs; k += 1.0) {
        let z = 1.0 - 2.0 * (k + 0.5) / dirs;
        let phi = k * PI * (3.0 - sqrt(5.0));
        let s = sqrt(1.0 - z * z);
        let dir = vec3f(s * cos(phi), z, s * sin(phi));
        let mu = dir.y;
        let seg = sky_segment(r, mu);
        var throughput = vec3f(1.0);
        var lum = vec3f(0.0);
        var fms_dir = vec3f(0.0);
        for (var i = 0.0; i < steps; i += 1.0) {
            let t0 = seg * (i / steps) * (i / steps);
            let t1 = seg * ((i + 1.0) / steps) * ((i + 1.0) / steps);
            let dt = t1 - t0;
            let x = pos + dir * (t0 + dt * 0.5);
            let rx = length(x);
            let m = sky_medium(rx - sky_bottom());
            let step_t = exp(-m.extinction * dt);
            let integ = select(vec3f(dt), (1.0 - step_t) / max(m.extinction, vec3f(1e-12)), m.extinction > vec3f(0.0));
            let sun_t = sky_transmittance(rx, dot(x, sun) / rx);
            lum += throughput * m.scattering * sun_t * isotropic * integ;
            fms_dir += throughput * m.scattering * integ;
            throughput *= step_t;
        }
        if (sky_hits_ground(r, mu)) {
            let x = pos + dir * seg;
            let n = normalize(x);
            let nl = max(0.0, dot(n, sun));
            lum += throughput * sky_transmittance(sky_bottom(), dot(n, sun)) * sky.ground.rgb * nl / PI;
        }
        l2 += lum * (4.0 * PI / dirs);
        fms += fms_dir * (4.0 * PI / dirs);
    }
    l2 *= isotropic;
    fms *= isotropic;
    textureStore(sky_multiscatter_out, texel, vec4f(l2 / (1.0 - fms), 1.0));
}
