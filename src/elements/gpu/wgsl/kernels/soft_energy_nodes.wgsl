// Energia das partículas de um corpo mole de nós com o inverso da massa em `pos.w` (XPBD, FEM; spec 037): no bloco
// `chunk`, a fatia estriada `lane, lane + WORKGROUP_SIZE, …` das partículas, ½·m·|v|² e −m·g·x no campo uniforme por
// partícula. Partícula fixa (inverso 0, massa infinita) fica fora.
// Requer: WORKGROUP_SIZE, SOFT_ENERGY_CHUNK, soft_energy_params, soft_nodes.

fn soft_energy_node_terms(r: SoftBodyRange, chunk: u32, lane: u32) -> vec2f {
    var kinetic = 0.0;
    var potential = 0.0;
    let end = min((chunk + 1u) * SOFT_ENERGY_CHUNK, r.count);
    for (var k = chunk * SOFT_ENERGY_CHUNK + lane; k < end; k += WORKGROUP_SIZE) {
        let p = soft_nodes[r.first + k];
        if (p.pos.w > 0.0) {
            let m = 1.0 / p.pos.w;
            kinetic += 0.5 * m * dot(p.vel.xyz, p.vel.xyz);
            potential += -m * dot(soft_energy_params.gravity.xyz, p.pos.xyz);
        }
    }
    return vec2f(kinetic, potential);
}
