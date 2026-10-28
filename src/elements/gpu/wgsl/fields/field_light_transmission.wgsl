// Contribuição do campo dos fluidos ao ponto `light_transmission` (spec 034, T067c): a luz das fontes que atravessa a
// superfície da água até o ponto chega em linha reta — o Fresnel exato na primeira superfície no caminho da luz (o índice
// do fechamento do corpo ali; acima do ângulo crítico, nada) e Beer–Lambert pelos trechos dentro da água (até 4), sem o
// foco: a parcela que as cáusticas corrigem (os fótons guardam a diferença para o caminho refratado). Uma marcha só ao
// longo do raio da luz — a que acha a primeira superfície é a do primeiro trecho de água (antes, o acerto e a
// transmitância marchavam o mesmo trecho duas vezes; a luz direta de cada acerto da refração pagava as duas).
// Requer: fields, ray_volume_types, ray_volume_material, field_surface, bsdf, light_incoming, lights.

fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (light >= arrayLength(&lights)) { return vec3f(1.0); }
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
