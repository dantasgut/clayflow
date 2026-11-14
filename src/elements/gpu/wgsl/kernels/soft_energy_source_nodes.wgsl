// Fonte da energia de um corpo mole de nós sem termo elástico (ponto `soft_energy_source`, spec 037): o FEM (o motor
// ainda não tem o modelo elástico dele) e o XPBD sem restrições na cena.
// Requer: soft_energy_nodes.

fn soft_energy_source_terms(r: SoftBodyRange, chunk: u32, lane: u32) -> vec3f {
    return vec3f(soft_energy_node_terms(r, chunk, lane), 0.0);
}
