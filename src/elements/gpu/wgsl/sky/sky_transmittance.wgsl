// Tabela de transmitância da atmosfera (spec 033, R4): por (raio, cosseno zenital) na parametrização de Bruneton, a
// transmitância até o topo — integração numérica de 40 passos. Gerada quando os parâmetros mudam.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, sky_atmosphere, sky, sky_transmittance_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn sky_transmittance_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(sky_transmittance_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let texel = vec2u(i % size.x, i / size.x);
    let uv = (vec2f(texel) + 0.5) / vec2f(size);
    let rm = sky_transmittance_params(uv);
    let r = rm.x;
    let mu = rm.y;
    let seg = sky_distance_to_top(r, mu);
    let steps = 40.0;
    var depth = vec3f(0.0);
    for (var i = 0.0; i < steps; i += 1.0) {
        // Passos quadráticos: mais amostras nas camadas baixas, densas.
        let t0 = seg * (i / steps) * (i / steps);
        let t1 = seg * ((i + 1.0) / steps) * ((i + 1.0) / steps);
        let dt = t1 - t0;
        let t = t0 + dt * 0.5;
        let ri = sqrt(r * r + t * t + 2.0 * r * mu * t);
        depth += sky_medium(ri - sky_bottom()).extinction * dt;
    }
    textureStore(sky_transmittance_out, texel, vec4f(exp(-depth), 1.0));
}
