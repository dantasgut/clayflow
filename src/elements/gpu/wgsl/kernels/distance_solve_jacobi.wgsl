// portado de legacy/elements/physics/gpu/wgsl/kernels/distance_solve_jacobi.wgsl.ts
const JACOBI_FIXED_SCALE: f32 = 1e6;
const JACOBI_MAX_I32: f32 = 2.1e9;

@group(0) @binding(0) var<uniform>             params:      SimParams;
@group(0) @binding(1) var<storage, read>       particles:   array<Particle>;
@group(0) @binding(2) var<storage, read>       constraints: array<DistanceConstraint>;
@group(0) @binding(3) var<storage, read_write> accum:       array<atomic<i32>>;

@compute @workgroup_size(64)
fn distance_solve_jacobi_main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x >= params.constraint_count) { return; }

    let ci = gid.x;
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
    let dLambda     = -(C) / (wA + wB + alpha_tilde);

    let corrA = -wA * dLambda * n;
    let corrB =  wB * dLambda * n;

    let baseA = i32(c.i) * 4;
    let baseB = i32(c.j) * 4;

    atomicAdd(&accum[baseA],     i32(clamp(corrA.x * JACOBI_FIXED_SCALE, -JACOBI_MAX_I32, JACOBI_MAX_I32)));
    atomicAdd(&accum[baseA + 1], i32(clamp(corrA.y * JACOBI_FIXED_SCALE, -JACOBI_MAX_I32, JACOBI_MAX_I32)));
    atomicAdd(&accum[baseA + 2], i32(clamp(corrA.z * JACOBI_FIXED_SCALE, -JACOBI_MAX_I32, JACOBI_MAX_I32)));
    atomicAdd(&accum[baseA + 3], 1);

    atomicAdd(&accum[baseB],     i32(clamp(corrB.x * JACOBI_FIXED_SCALE, -JACOBI_MAX_I32, JACOBI_MAX_I32)));
    atomicAdd(&accum[baseB + 1], i32(clamp(corrB.y * JACOBI_FIXED_SCALE, -JACOBI_MAX_I32, JACOBI_MAX_I32)));
    atomicAdd(&accum[baseB + 2], i32(clamp(corrB.z * JACOBI_FIXED_SCALE, -JACOBI_MAX_I32, JACOBI_MAX_I32)));
    atomicAdd(&accum[baseB + 3], 1);
}
