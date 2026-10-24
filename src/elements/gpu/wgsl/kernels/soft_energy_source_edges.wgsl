// Fonte da energia de um corpo XPBD com as arestas (ponto `soft_energy_source`, spec 037): no bloco `chunk`, as
// partículas e a fatia estriada das arestas do corpo, ½·C²/α de cada restrição de distância com complacência α > 0
// (C = |pⱼ − pᵢ| − repouso: a energia de que o XPBD é a minimização); α = 0 é restrição rígida, sem energia definida.
// Requer: WORKGROUP_SIZE, SOFT_ENERGY_CHUNK, soft_energy_nodes, soft_nodes, soft_edges.

fn soft_energy_source_terms(r: SoftBodyRange, chunk: u32, lane: u32) -> vec3f {
    var elastic = 0.0;
    let end = min((chunk + 1u) * SOFT_ENERGY_CHUNK, r.edge_count);
    for (var k = chunk * SOFT_ENERGY_CHUNK + lane; k < end; k += WORKGROUP_SIZE) {
        let e = soft_edges[r.first_edge + k];
        if (e.compliance > 0.0) {
            let c = length(soft_nodes[e.j].pos.xyz - soft_nodes[e.i].pos.xyz) - e.rest_length;
            elastic += 0.5 * c * c / e.compliance;
        }
    }
    return vec3f(soft_energy_node_terms(r, chunk, lane), elastic);
}
