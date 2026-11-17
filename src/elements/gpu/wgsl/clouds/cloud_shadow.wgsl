// Mapa de transmitância visto do sol (spec 041, R11): por texel da projeção ortográfica do sol centrada na câmera,
// o raio que desce do sol atravessa o primeiro trecho da casca com 32 passos (teto constante), com a erosão das bordas; o texel
// guarda a profundidade ótica acumulada ao fim de cada quarto do trecho (r, g, b, a = ¼, ½, ¾ e o trecho inteiro) —
// os nós são da geometria (a casca), recalculados na leitura. O mapa inteiro a cada quadro: quem recebe a luz do sol
// lê o do quadro.
// Despacho linear: um texel por invocação.
// Requer: WORKGROUP_SIZE, cloud_common, cloud_density, clouds, cloud_shadow_out.

const CLOUD_SHADOW_STEPS: u32 = 32u;

@compute @workgroup_size(WORKGROUP_SIZE)
fn cloud_shadow_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(cloud_shadow_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let uv = (vec2f(g.xy) + 0.5) / vec2f(size) - 0.5;
    let sun = clouds.sunDir.xyz;
    let origin = clouds.sunFrame.xyz + clouds.sunRight.xyz * uv.x * clouds.sunFrame.w
        + clouds.sunUp.xyz * uv.y * clouds.sunFrame.w + sun * clouds.sunRight.w;
    let segs = cloud_shell_segments(origin, -sun, 1e9);
    if (segs.y <= segs.x || sun.y <= 0.0) {
        textureStore(cloud_shadow_out, g.xy, vec4f(0.0));
        return;
    }
    let dt = (segs.y - segs.x) / f32(CLOUD_SHADOW_STEPS);
    let quarter = CLOUD_SHADOW_STEPS / 4u;
    var tau = 0.0;
    var knots = vec4f(0.0);
    for (var k = 0u; k < CLOUD_SHADOW_STEPS; k++) {
        let t = segs.x + (f32(k) + 0.5) * dt;
        tau += cloud_density(origin - sun * t, true) * clouds.layer.z * dt;
        if ((k + 1u) % quarter == 0u) { knots[(k + 1u) / quarter - 1u] = tau; }
    }
    textureStore(cloud_shadow_out, g.xy, knots);
}
