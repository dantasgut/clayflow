// Tabela da perspectiva aérea (spec 041, R10; Hillaire 2020, §5.4): 32 × 32 colunas pela tela da câmera ativa (a direção
// do centro de cada coluna, sem o deslocamento da amostra) e 32 fatias de distância em distribuição quadrática até
// `SKY_AERIAL_RANGE` km (a fatia k vai até `D·((k + 1)/32)²`: finas perto, para as cenas de metros): a luz espalhada da
// câmera até o fim da fatia (rgb, por unidade de iluminância do sol: simples de Rayleigh e Mie com a transmitância do sol
// mais o múltiplo Ψms) e a transmitância (rgb). Dois subpassos por fatia: 64 passos por coluna (teto constante).
// Despacho linear: uma coluna por invocação.
// Requer: WORKGROUP_SIZE, SKY_AERIAL_RANGE, view_space, sky_atmosphere, sky_lookup, sky, cameras, sky_aerial_out, sky_aerial_transmittance_out.

const SKY_AERIAL_SLICES: u32 = 32u;
const SKY_AERIAL_SUBSTEPS: u32 = 2u;

@compute @workgroup_size(WORKGROUP_SIZE)
fn sky_aerial_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let size = textureDimensions(sky_aerial_out);
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= size.x * size.y) { return; }
    let g = vec3u(i % size.x, i / size.x, 0u);
    let cam = cameras[sky.cameraSlot];
    let uv = (vec2f(g.xy) + 0.5) / vec2f(size.xy);
    let ndc = uv_to_ndc(uv);
    let far = cam.inverseUnjitteredViewProjection * vec4f(ndc, 1.0, 1.0);
    let near = cam.inverseUnjitteredViewProjection * vec4f(ndc, 0.0, 1.0);
    let view = normalize(far.xyz / far.w - near.xyz / near.w);
    let r0 = sky_bottom() + max(sky.radii.w + cam.position.y * 0.001, 0.001);
    let pos = vec3f(0.0, r0, 0.0);
    let seg = sky_segment(r0, view.y);
    let sun_cos = clamp(sky.sunDirection.y, -1.0, 1.0);
    // O sol no plano x-y, a vista girada com o mesmo azimute relativo (como na vista do céu).
    let sun = vec3f(sqrt(max(0.0, 1.0 - sun_cos * sun_cos)), sun_cos, 0.0);
    let a = view.xz;
    let b = sky.sunDirection.xz;
    let cos_az = select(1.0, dot(a, b) / (length(a) * length(b)), length(a) > 1e-6 && length(b) > 1e-6);
    let sin_az = sqrt(max(0.0, 1.0 - cos_az * cos_az));
    let h = length(a);
    let dir = vec3f(h * cos_az, view.y, h * sin_az);
    let c = dot(dir, sun);
    let pr = sky_rayleigh_phase(c);
    let pm = sky_mie_phase(c);
    var throughput = vec3f(1.0);
    var lum = vec3f(0.0);
    var t = 0.0;
    for (var k = 0u; k < SKY_AERIAL_SLICES; k++) {
        let s1 = f32(k + 1u) / f32(SKY_AERIAL_SLICES);
        let t_end = SKY_AERIAL_RANGE * s1 * s1;
        let dt = (t_end - t) / f32(SKY_AERIAL_SUBSTEPS);
        for (var j = 0u; j < SKY_AERIAL_SUBSTEPS; j++) {
            let mid = t + (f32(j) + 0.5) * dt;
            let inside = mid < seg;
            let x = pos + dir * mid;
            let rx = length(x);
            let m = sky_medium(rx - sky_bottom());
            let step_t = select(vec3f(1.0), exp(-m.extinction * dt), inside);
            let integ = select(vec3f(dt), (1.0 - step_t) / max(m.extinction, vec3f(1e-12)), m.extinction > vec3f(0.0));
            let mu_s = dot(x, sun) / rx;
            let single = (m.rayleigh * pr + vec3f(m.mie * pm)) * sky_transmittance(rx, mu_s);
            let multi = m.scattering * sky_multiscatter(rx, mu_s);
            if (inside) { lum += throughput * (single + multi) * integ; }
            throughput *= step_t;
        }
        t = t_end;
        textureStore(sky_aerial_out, vec3u(g.xy, k), vec4f(lum, 1.0));
        textureStore(sky_aerial_transmittance_out, vec3u(g.xy, k), vec4f(throughput, 1.0));
    }
}
