// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_density_lambda.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

// Poly6 W(r, h): suave perto do centro
fn W_poly6(r_sq: f32, h: f32) -> f32 {
    let h_sq = h * h;
    if (r_sq >= h_sq) { return 0.0; }
    let d = h_sq - r_sq;
    // 315 / (64 * PI * h^9)
    let coeff = 315.0 / (64.0 * 3.14159265 * pow(h, 9.0));
    return coeff * d * d * d;
}

// Gradiente Spiky ∇W(r, h): não nulo em r=0; bom para pressão
fn grad_W_spiky(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r <= 0.0001 || r >= h) { return vec3f(0.0); }
    // -45 / (PI * h^6) * (h - r)^2 / r * r_vec
    let coeff = -45.0 / (3.14159265 * pow(h, 6.0));
    let d = h - r;
    return coeff * (d * d / r) * r_vec;
}

@compute @workgroup_size(64)
fn pbf_density_lambda_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let h        = pbf_params.config.y;
    let rho0     = pbf_params.config.x;
    let epsilon  = pbf_params.config.z;
    let max_nb   = pbf_params.counts.z;
    let nb_count = neighbor_count[i];
    let xi       = particles[i].pos.xyz;

    // Densidade
    var rho = W_poly6(0.0, h);  // auto-contribuição (r=0)
    var sum_grad_sq = 0.0;
    var grad_i = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j   = neighbor_list[i * max_nb + k];
        let xj  = particles[j].pos.xyz;
        let dv  = xi - xj;
        let r_sq = dot(dv, dv);
        let r    = sqrt(r_sq);

        rho += W_poly6(r_sq, h);

        // ∇_{xi} C_i acumula; ∇_{xj} C_i = −gw → ‖−gw‖² = ‖gw‖²
        let gw = grad_W_spiky(dv, r, h) / rho0;
        grad_i      += gw;
        sum_grad_sq += dot(gw, gw);   // contribuição de j (∇_{xj} C_i)
    }
    // Contribuição de i (∇_{xi} C_i) — adicionada UMA vez fora do loop
    sum_grad_sq += dot(grad_i, grad_i);

    let C = rho / rho0 - 1.0;
    let lambda = -C / (sum_grad_sq + epsilon);

    // Escreve λ em pos.w
    particles[i].pos.w = lambda;
}
