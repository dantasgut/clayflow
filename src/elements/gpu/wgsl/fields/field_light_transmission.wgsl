// Contribuição do campo dos fluidos ao ponto `light_transmission` (spec 034, T067c): a luz das fontes que atravessa a
// superfície da água até o ponto chega em linha reta — o Fresnel exato na primeira superfície no caminho da luz (o índice
// do fechamento do corpo ali; acima do ângulo crítico, nada) e Beer–Lambert pelos trechos dentro da água (até 4), sem o
// foco: a parcela que as cáusticas corrigem (os fótons guardam a diferença para o caminho refratado). Uma marcha só ao
// longo do raio da luz — a que acha a primeira superfície é a do primeiro trecho de água (antes, o acerto e a
// transmitância marchavam o mesmo trecho duas vezes; a luz direta de cada acerto da refração pagava as duas).
// As luzes direcionais com mapa (`field_light_map.wgsl`, até `fluid_field.lights.z`) leem a transmitância do mapa (as
// duas primeiras camadas de água no raio da luz, interpolada entre os quatro texels vizinhos); as outras marcham.
// Requer: fields, ray_volume_types, ray_volume_material, field_surface, field_light_frame, bsdf, light_incoming, lights,
// field_light_map.

/** A transmitância até o ponto à distância `t` (desde o plano da luz) pelo texel `texel` do mapa `k`. */
fn field_light_texel(k: u32, texel: vec2i, t: f32) -> vec3f {
    let res = i32(fluid_field.lights.y);
    if (any(texel < vec2i(0)) || any(texel >= vec2i(res))) { return vec3f(1.0); }
    let w = (k * u32(res * res) + u32(texel.y * res + texel.x)) * FIELD_LIGHT_WORDS;
    let enter1 = field_light_map[w];
    if (t <= enter1) { return vec3f(1.0); }
    let exit1 = field_light_map[w + 1u];
    let enter2 = field_light_map[w + 2u];
    let exit2 = field_light_map[w + 3u];
    var out = vec3f(field_light_map[w + 4u]);
    out *= exp(-closure_absorption(field_medium(bitcast<u32>(field_light_map[w + 5u])))
        * max(min(t, exit1) - enter1, 0.0));
    if (t > enter2) {
        out *= exp(-closure_absorption(field_medium(bitcast<u32>(field_light_map[w + 6u])))
            * max(min(t, exit2) - enter2, 0.0));
    }
    return out;
}

/** A transmitância da luz direcional do mapa `k` (direção `direction`) até `p`, entre os quatro texels vizinhos. */
fn field_light_mapped(k: u32, direction: vec3f, p: vec3f) -> vec3f {
    let f = field_light_frame(direction);
    if (f.size.x <= 0.0) { return vec3f(1.0); }
    let rel = p - f.origin;
    let res = f32(fluid_field.lights.y);
    let x = vec2f(dot(rel, f.u) / f.size.x, dot(rel, f.v) / f.size.y) * res - 0.5;
    let t = dot(rel, f.dir);
    let base = vec2i(floor(x));
    let s = x - floor(x);
    let a = mix(field_light_texel(k, base, t), field_light_texel(k, base + vec2i(1, 0), t), s.x);
    let b = mix(field_light_texel(k, base + vec2i(0, 1), t), field_light_texel(k, base + vec2i(1, 1), t), s.x);
    return mix(a, b, s.y);
}

fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (light >= arrayLength(&lights)) { return vec3f(1.0); }
    let map = field_light_map_of(light);
    if (map != NONE) { return field_light_mapped(map, lights[light].direction.xyz, p); }
    let to = light_incoming(lights[light], p);
    let dir = to.l;
    let span = field_clip(p, dir, 0.0, min(to.dist, 1e6));
    if (span.x >= span.y) { return vec3f(1.0); }
    var transmittance = vec3f(1.0);
    var t = span.x;
    for (var k = 0u; k < 4u && t < span.y; k++) {
        // O primeiro trecho com o ponto dentro da água (a origem no campo, φ < 0 nela): sem superfície de entrada.
        let start_inside = k == 0u && t <= 0.0 && field_phi_at(p) < 0.0;
        var enter = t;
        var body = field_body_at(p + dir * t);
        var normal = -dir;
        if (!start_inside) {
            // De fora: até a superfície, com a normal refinada (a de entrada do trecho; na primeira, o Fresnel).
            let h = field_march(p, dir, t, span.y, false, true, false);
            if (!h.hit) { break; }
            enter = h.t;
            body = h.body;
            normal = h.n;
        }
        // De dentro até sair; no primeiro trecho com o ponto dentro, a saída é a primeira superfície: refinada.
        let exit = field_march(p, dir, select(enter + field_voxel(), t, start_inside), span.y, true, start_inside, false);
        // O fechamento do corpo na superfície que a luz cruza no trecho (a de entrada; com o ponto dentro, a de saída —
        // a única do trecho): o índice do Fresnel e a absorção dele, uma avaliação do material por trecho.
        var at = RayVolumeHit(enter, p + dir * enter, normal, body, true, false, 0u, false, 0.0);
        if (start_inside) {
            at = RayVolumeHit(exit.t, exit.p, exit.n, select(exit.body, body, body != 0u), true, true, 0u, false, 0.0);
        }
        let c = ray_volume_surface_closure(at, field_surface(at), 0.0);
        if (k == 0u) {
            // A razão dos índices no sentido da luz: entrando na água, ou saindo dela com o ponto dentro.
            let ior = max(c.transmission_ior, 1.0);
            transmittance *= 1.0 - bsdf_f_dielectric(abs(dot(dir, at.normal)), select(ior, 1.0 / ior, start_inside));
        }
        if (body > 0u || start_inside) {
            transmittance *= exp(-closure_absorption(c) * max(exit.t - enter, 0.0));
        }
        t = exit.t + field_voxel();
    }
    return transmittance;
}
