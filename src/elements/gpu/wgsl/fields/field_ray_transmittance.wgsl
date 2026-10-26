// Contribuição do campo dos fluidos ao ponto `ray_volume_transmittance` (spec 033, R11): ao longo do segmento, cada
// trecho dentro da água (até 4: entrar pela marcha de fora, com a normal refinada; sair pela de dentro, sem ela) atenua
// por Beer-Lambert com a absorção do corpo daquele trecho — a do fechamento dele no ponto de entrada (`field_closure`: a
// função `material` do corpo, ou o `FluidSurfaceMaterial`, cuja absorção vem escalada como a espessura na composição);
// no trecho que começa dentro da água não há superfície: o fechamento na origem, com a normal contra o raio.
// Requer: fields, ray_volume_types, ray_volume_material, field_surface (ou field_surface_fluid).

fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f {
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return vec3f(1.0); }
    var transmittance = vec3f(1.0);
    var t = span.x;
    for (var k = 0u; k < 4u && t < span.y; k++) {
        var enter = t;
        var body = field_body_at(origin + dir * t);
        var normal = -dir;
        if (field_phi_at(origin + dir * t) >= 0.0) {
            let h = field_march(origin, dir, t, span.y, false, true, false);
            if (!h.hit) { break; }
            enter = h.t;
            body = h.body;
            normal = h.n;
        }
        let exit = field_march(origin, dir, enter + field_voxel(), span.y, true, false, false);
        if (body > 0u) {
            let at = RayVolumeHit(enter, origin + dir * enter, normal, body, true, false, 0u, false);
            transmittance *= exp(-closure_absorption(ray_volume_surface_closure(at, field_surface(at), time)) * max(exit.t - enter, 0.0));
        }
        t = exit.t + field_voxel();
    }
    return transmittance;
}
