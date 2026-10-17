// Contribuição do campo dos fluidos ao ponto `ray_volume_transmittance` (spec 033, R11): ao longo do segmento, cada
// trecho dentro da água (até 4: entrar pela marcha de fora, sair pela de dentro, sem o refinamento da normal) atenua por
// Beer-Lambert com a absorção do material daquele trecho (escalada como a espessura na composição).
// Requer: fields, field_materials.

fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f {
    let span = field_clip(origin, dir, 0.0, t_max);
    if (span.x >= span.y) { return vec3f(1.0); }
    var transmittance = vec3f(1.0);
    var t = span.x;
    for (var k = 0u; k < 4u && t < span.y; k++) {
        var enter = t;
        var material = field_material_at(origin + dir * t);
        if (field_phi_at(origin + dir * t) >= 0.0) {
            let h = field_march(origin, dir, t, span.y, false, false);
            if (!h.hit) { break; }
            enter = h.t;
            material = h.material;
        }
        let exit = field_march(origin, dir, enter + field_voxel(), span.y, true, false);
        if (material > 0u) {
            let m = field_materials[material - 1u];
            transmittance *= exp(-m.absorption.rgb * m.thicknessScale * max(exit.t - enter, 0.0));
        }
        t = exit.t + field_voxel();
    }
    return transmittance;
}
