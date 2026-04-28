// portado de legacy/elements/physics/gpu/wgsl/kernels/distance_solve_color.wgsl.ts
struct ColorRange {
    offset: u32,
    count:  u32,
    _pad:   vec2u,
}

@group(0) @binding(0) var<uniform>             params:      SimParams;
@group(0) @binding(1) var<storage, read_write> particles:   array<Particle>;
@group(0) @binding(2) var<storage, read>       constraints: array<DistanceConstraint>;
@group(0) @binding(3) var<storage, read_write> lambdas:     array<f32>;
@group(1) @binding(0) var<uniform>             color_range: ColorRange;

@compute @workgroup_size(64)
fn distance_solve_color_main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x >= color_range.count) { return; }

    let ci = color_range.offset + gid.x;
    let c  = constraints[ci];

    let pA = particles[c.i].pred.xyz;
    let pB = particles[c.j].pred.xyz;

    let diff = pB - pA;
    let dist = length(diff);
    if (dist < 1e-8) { return; }

    let dt2         = params.dt * params.dt;
    let n           = diff / dist;
    let C           = dist - c.rest_length;
    let wA          = particles[c.i].pos.w;
    let wB          = particles[c.j].pos.w;
    let alpha_tilde = c.compliance / dt2;

    // Warm-starting (Fase 3b): reutiliza λ do frame anterior como ponto de partida.
    // Para constraints com compliance > 0 reduz iterações em 40-60% em cenas quasi-estáticas.
    let lambda_old  = lambdas[ci];
    let dLambda     = -(C + alpha_tilde * lambda_old) / (wA + wB + alpha_tilde);
    lambdas[ci]     = lambda_old + dLambda;

    // Partículas desta cor não são compartilhadas com outras threads → sem conflito
    particles[c.i].pred = vec4f(pA - wA * dLambda * n, particles[c.i].pred.w);
    particles[c.j].pred = vec4f(pB + wB * dLambda * n, particles[c.j].pred.w);
}
