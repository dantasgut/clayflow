// portado de legacy/elements/physics/gpu/wgsl/kernels/jacobi_apply.wgsl.ts
const JACOBI_FIXED_SCALE: f32 = 1e6;

@group(0) @binding(0) var<uniform>             params:    SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> accum:     array<atomic<i32>>;

@compute @workgroup_size(64)
fn jacobi_apply_main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x >= params.particle_count) { return; }

    let pi   = gid.x;
    let base = i32(pi) * 4;

    let count = atomicLoad(&accum[base + 3]);
    if (count == 0) { return; }

    let dx = f32(atomicLoad(&accum[base]))     / JACOBI_FIXED_SCALE;
    let dy = f32(atomicLoad(&accum[base + 1])) / JACOBI_FIXED_SCALE;
    let dz = f32(atomicLoad(&accum[base + 2])) / JACOBI_FIXED_SCALE;

    let invCount = 1.0 / f32(count);
    let p = particles[pi];
    particles[pi].pred = vec4f(p.pred.xyz + vec3f(dx, dy, dz) * invCount, p.pred.w);
}
