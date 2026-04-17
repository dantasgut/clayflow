/**
 * Kernel WGSL: jacobi_apply — aplica correções Jacobi e limpa o acumulador.
 *
 * Par do kernel `distance_solve_jacobi`. Lê o buffer `accum` preenchido
 * pelo solve, calcula a correção média por partícula (soma/count), aplica
 * em `particles[pi].pred`, e zera os slots para a próxima iteração.
 *
 * ## Bind groups
 *
 * @group(0) @binding(0) — SimParams           (uniform)
 * @group(0) @binding(1) — Particle[]          (storage read_write)
 * @group(0) @binding(2) — accum: atomic<i32>[] (storage read_write — [N×4])
 *
 * ## Dispatch
 *
 * ceil(particle_count / 64) workgroups. Threads com gid.x >= particle_count
 * fazem early-return.
 *
 * ## Barreira
 *
 * DEVE ser em um compute pass separado do `distance_solve_jacobi`. A barreira
 * implícita entre passes WebGPU garante que o acúmulo está completo ao ler.
 * O buffer accum é limpo pelo encoder via clearBuffer antes do próximo pass de solve.
 *
 * Depende de: SimParams, Particle.
 */
export const WGSL_KERNEL_JACOBI_APPLY = /* wgsl */`

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
`;
