// Energia dos corpos rígidos (spec 037): a série temporal `BodyEnergy` (canal da C2, no slot do corpo). Por corpo
// dinâmico: a cinética de translação ½·m·|v|² e de rotação ½·ω_cᵀ·I·ω_c (ω no mundo levado ao corpo pela orientação; I
// a diagonal da inércia, eixo travado = sem rotação nele), a potencial −m·g·x no campo uniforme, a potência dissipada no
// passo (E da fatia anterior − E)/dt e a energia dissipada na janela (E da fatia mais antiga − E) — cada uma só quando a
// série já tem a fatia (`energy_meter.counts.y`, os passos gravados seguidos). Corpo cinemático (massa infinita): zero.
// Requer: WORKGROUP_SIZE, quat, energy_meter, energy_bodies, body_energy, body_energy_previous, body_energy_oldest.

@compute @workgroup_size(WORKGROUP_SIZE)
fn body_energy_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= energy_meter.counts.x) { return; }
    let b = energy_bodies[i];
    var kinetic = 0.0;
    var potential = 0.0;
    if (b.pos.w > 0.0) {
        let m = 1.0 / b.pos.w;
        let wc = quat_rotate_vec_inv(b.rot, b.omega.xyz);
        let inertia = select(vec3f(0.0), 1.0 / b.I_inv.xyz, b.I_inv.xyz > vec3f(0.0));
        kinetic = 0.5 * m * dot(b.vel.xyz, b.vel.xyz) + 0.5 * dot(inertia * wc, wc);
        potential = -m * dot(energy_meter.gravity.xyz, b.pos.xyz);
    }
    let e = kinetic + potential;
    var power = 0.0;
    var window = 0.0;
    if (energy_meter.counts.y >= 1u) {
        let p = body_energy_previous[i];
        power = (p.kinetic + p.potential - e) / energy_meter.gravity.w;
    }
    if (energy_meter.counts.y >= energy_meter.counts.z - 1u) {
        let o = body_energy_oldest[i];
        window = o.kinetic + o.potential - e;
    }
    body_energy[i] = BodyEnergy(kinetic, potential, power, window);
}
