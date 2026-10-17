// Tabela DFG (spec 011, R3): por texel (μ = n·v no eixo x, rugosidade no eixo y; os texels das pontas valem 0 e 1),
// o especular de F0 = 1 separado em E = F0·A + B (GGX por amostragem por importância, visibilidade de Smith
// correlacionada) e o albedo direcional do sheen (Charlie + Neubelt, amostragem uniforme do hemisfério). Gerada uma vez,
// na GPU; a referência de CPU é `elements/material/reference/dfg.ts` (a mesma integração e as mesmas amostras).
// Requer: bsdf; WORKGROUP_SIZE; recurso `pbr_dfg_out` (a textura do `PbrTables`). Despacho linear: um texel por invocação.

const PBR_DFG_SAMPLES: u32 = 512u;

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbr_dfg_build(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let size = textureDimensions(pbr_dfg_out);
    let i_texel = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i_texel >= size.x * size.y) { return; }
    let texel = vec2u(i_texel % size.x, i_texel / size.x);
    let nv = max(f32(texel.x) / f32(size.x - 1u), 1e-4);
    let roughness = f32(texel.y) / f32(size.y - 1u);
    let v = vec3f(sqrt(1.0 - nv * nv), 0.0, nv);
    let r = max(roughness, BSDF_MIN_ROUGHNESS);
    let alpha = r * r;
    let a2 = alpha * alpha;
    var a = 0.0;
    var b = 0.0;
    var sheen = 0.0;
    for (var i = 0u; i < PBR_DFG_SAMPLES; i = i + 1u) {
        let u1 = f32(i) / f32(PBR_DFG_SAMPLES);
        let u2 = f32(reverseBits(i)) * 2.3283064365386963e-10;
        let phi = 2.0 * BSDF_PI * u1;
        let cos_h = sqrt((1.0 - u2) / (1.0 + (a2 - 1.0) * u2));
        let sin_h = sqrt(1.0 - cos_h * cos_h);
        let h = vec3f(sin_h * cos(phi), sin_h * sin(phi), cos_h);
        let vh = dot(v, h);
        let lz = 2.0 * vh * h.z - v.z;
        if (lz > 0.0 && vh > 0.0) {
            let g_vis = bsdf_v_smith_correlated(nv, lz, a2) * 4.0 * lz * vh / h.z;
            let fc = pow(1.0 - vh, 5.0);
            a = a + (1.0 - fc) * g_vis;
            b = b + fc * g_vis;
        }
        let cl = u2;
        let sl = sqrt(1.0 - cl * cl);
        let l = vec3f(sl * cos(phi), sl * sin(phi), cl);
        let hs = v + l;
        let len = length(hs);
        if (len > 1e-6 && cl > 0.0) {
            sheen = sheen + bsdf_d_charlie(hs.z / len, roughness) * bsdf_v_neubelt(nv, cl) * cl * 2.0 * BSDF_PI;
        }
    }
    let n = f32(PBR_DFG_SAMPLES);
    textureStore(pbr_dfg_out, texel, vec4f(a / n, b / n, min(sheen / n, 1.0), 1.0));
}
