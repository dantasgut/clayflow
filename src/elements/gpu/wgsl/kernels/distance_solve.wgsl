// portado de legacy/elements/physics/gpu/wgsl/kernels/distance_solve.wgsl.ts
@group(0) @binding(0) var<uniform>             params:      SimParams;
@group(0) @binding(1) var<storage, read_write> particles:   array<Particle>;
@group(0) @binding(2) var<storage, read>       constraints: array<DistanceConstraint>;

@compute @workgroup_size(1)
fn distance_solve_main(@builtin(global_invocation_id) _gid: vec3u) {
    let dt2 = params.dt * params.dt;

    for (var ci = 0u; ci < params.constraint_count; ci++) {
        let c  = constraints[ci];
        let pA = particles[c.i].pred.xyz;
        let pB = particles[c.j].pred.xyz;

        let diff = pB - pA;
        let dist = length(diff);
        if (dist < 1e-8) { continue; }  // partículas coincidentes — skip

        let n           = diff / dist;                          // de A → B
        let C           = dist - c.rest_length;                 // violação
        let wA          = particles[c.i].pos.w;                 // invMass A
        let wB          = particles[c.j].pos.w;                 // invMass B
        let alpha_tilde = c.compliance / dt2;                   // compliance normalizado
        let dLambda     = xpbd_delta_lambda(C, wA + wB, alpha_tilde);

        // pA.pred -= wA * dLambda * n  (= xpbd_position_correction com sinal A)
        particles[c.i].pred = vec4f(pA - wA * dLambda * n, particles[c.i].pred.w);
        // pB.pred += wB * dLambda * n  (sinal oposto ao de A)
        particles[c.j].pred = vec4f(pB + wB * dLambda * n, particles[c.j].pred.w);
    }
}
