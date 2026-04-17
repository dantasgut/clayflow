/**
 * Kernel WGSL: distance_solve_jacobi — XPBD Jacobi totalmente paralelo.
 *
 * Alternativa ao graph coloring (3a): todas as constraints resolvem em paralelo
 * sem reordenação — máximo paralelismo ao custo de 2× passes por iteração.
 *
 * ## Diferença do graph coloring
 *
 * Graph coloring: Gauss-Seidel entre cores (cor N+1 lê escritas de cor N).
 * Jacobi: todas as constraints leem posições atuais e acumulam correções
 * em um buffer de atômicos separado. Um segundo kernel (`jacobi_apply`)
 * aplica a correção média e limpa o buffer para a próxima iteração.
 *
 * ## Conflitos de escrita
 *
 * Múltiplas constraints podem apontar para a mesma partícula.
 * Solução: buffer de acúmulo `array<atomic<i32>>` com 4 slots por partícula:
 *   [pi*4+0] dx (fixed-point, escala 1e6)
 *   [pi*4+1] dy
 *   [pi*4+2] dz
 *   [pi*4+3] count (incrementado 1× por constraint que toca esta partícula)
 * O kernel `jacobi_apply` divide a soma pelo count para obter a correção média.
 *
 * ## Precisão fixed-point
 *
 * Escala 1e6 → precisão 1 μm, saturação em ±2147 m (seguro para física de cena).
 * Correções típicas: [-1, 1] m → [-1e6, 1e6] em i32 (dentro de 2^31 ≈ 2.1e9).
 *
 * ## Bind groups
 *
 * @group(0) @binding(0) — SimParams           (uniform)
 * @group(0) @binding(1) — Particle[]          (storage read — posições atuais)
 * @group(0) @binding(2) — DistanceConstraint[] (storage read)
 * @group(0) @binding(3) — accum: atomic<i32>[] (storage read_write — [N×4])
 *
 * ## Dispatch
 *
 * ceil(constraint_count / 64) workgroups. Threads com gid.x >= constraint_count
 * fazem early-return.
 *
 * ## Barreira
 *
 * DEVE ser em um compute pass separado do `jacobi_apply`. A barreira implícita
 * entre passes WebGPU garante que o acúmulo está completo antes de apply ler.
 *
 * Depende de: SimParams, Particle, DistanceConstraint.
 */
export const WGSL_KERNEL_DISTANCE_SOLVE_JACOBI = /* wgsl */`

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
`;
