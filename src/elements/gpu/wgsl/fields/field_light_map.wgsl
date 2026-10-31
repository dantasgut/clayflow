// O mapa da luz pela água (spec 039 refeita): por luz direcional do pool (até `fluid_field.lights.z`, na ordem dos
// slots), um texel por raio paralelo à luz sobre a projeção da caixa do campo no plano dela, numa grade de
// `fluid_field.lights.y`² texels. Cada texel marcha o campo uma vez por quadro e guarda as duas primeiras camadas de
// água no raio (a entrada e a saída de cada uma, em distância desde o plano da luz), a fração que a primeira superfície
// transmite (Fresnel, o índice do corpo) e os corpos — `light_transmission` lê o mapa em vez de marchar em cada ponto
// sombreado. Palavras por texel: `FIELD_LIGHT_WORDS`.
// Requer: WORKGROUP_SIZE, fields, field_light_frame, field_surface, bsdf, field_light_map_out.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_light_map_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let res = fluid_field.lights.y;
    let texels = res * res;
    if (i >= texels * fluid_field.lights.z) { return; }
    let k = i / texels;
    let texel = i % texels;
    let w = i * FIELD_LIGHT_WORDS;
    let light = field_light_slot(k);
    var a = vec4f(1e30);
    var b = vec4f(1.0, 0.0, 0.0, 0.0);
    if (light != NONE) {
        let frame = field_light_frame(lights[light].direction.xyz);
        if (frame.size.x > 0.0) {
            let uv = (vec2f(f32(texel % res), f32(texel / res)) + 0.5) / f32(res);
            let o = field_light_origin(frame, uv);
            let d = frame.dir;
            let t1 = frame.size.z;
            let e1 = field_march(o, d, 0.0, t1, false, true, false);
            if (e1.hit) {
                let x1 = field_march(o, d, e1.t + field_voxel(), t1, true, false, false);
                let medium = field_medium(e1.body);
                let ior = max(medium.transmission_ior, 1.0);
                b.x = 1.0 - bsdf_f_dielectric(abs(dot(d, e1.n)), ior);
                b.y = bitcast<f32>(e1.body);
                a.x = e1.t;
                a.y = x1.t;
                let e2 = field_march(o, d, x1.t + field_voxel(), t1, false, false, false);
                if (e2.hit) {
                    let x2 = field_march(o, d, e2.t + field_voxel(), t1, true, false, false);
                    a.z = e2.t;
                    a.w = x2.t;
                    b.z = bitcast<f32>(e2.body);
                }
            }
        }
    }
    for (var c = 0u; c < 4u; c++) {
        field_light_map_out[w + c] = a[c];
        field_light_map_out[w + 4u + c] = b[c];
    }
}
