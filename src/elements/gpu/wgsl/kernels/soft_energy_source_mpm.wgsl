// Fonte da energia de um corpo mole do MPM (ponto `soft_energy_source`, spec 037): no bloco `chunk`, a fatia estriada
// das partículas, ½·m·|v|², −m·g·x e a elástica Neo-Hookean V₀·ψ(F), ψ = μ/2·(tr FᵀF − 3) − μ·ln J + λ/2·(ln J)² — o
// modelo do P2G (o mesmo piso de J), com a massa, o volume de repouso e μ, λ do material (`soft_energy_params.material`).
// Requer: WORKGROUP_SIZE, SOFT_ENERGY_CHUNK, linalg, soft_energy_params, soft_mpm_particles.

fn soft_energy_source_terms(r: SoftBodyRange, chunk: u32, lane: u32) -> vec3f {
    let m = soft_energy_params.material.x;
    let volume = soft_energy_params.material.y;
    let mu = soft_energy_params.material.z;
    let lambda = soft_energy_params.material.w;
    var kinetic = 0.0;
    var potential = 0.0;
    var elastic = 0.0;
    let end = min((chunk + 1u) * SOFT_ENERGY_CHUNK, r.count);
    for (var k = chunk * SOFT_ENERGY_CHUNK + lane; k < end; k += WORKGROUP_SIZE) {
        let p = soft_mpm_particles[r.first + k];
        kinetic += 0.5 * m * dot(p.vel.xyz, p.vel.xyz);
        potential += -m * dot(soft_energy_params.gravity.xyz, p.pos.xyz);
        let f = mat3x3f(p.F_col0.xyz, p.F_col1.xyz, p.F_col2.xyz);
        let trace = dot(f[0], f[0]) + dot(f[1], f[1]) + dot(f[2], f[2]);
        let log_j = log(max(mat3_det(f), 1e-6));
        elastic += volume * (0.5 * mu * (trace - 3.0) - mu * log_j + 0.5 * lambda * log_j * log_j);
    }
    return vec3f(kinetic, potential, elastic);
}
