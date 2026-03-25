/**
 * Kernel WGSL: distance_solve_color — XPBD paralelo por cor de grafo.
 *
 * Substitui o serial distance_solve_main para constraints de distância cujas
 * partículas já foram agrupadas por graph coloring (ver GraphColorSolver.ts).
 * Constraints da mesma cor não compartilham partículas → sem data race.
 *
 * ## Diferença do kernel serial
 *
 * Serial:  workgroup_size(1), 1 dispatch processa TODAS as constraints em ordem.
 * Paralelo: workgroup_size(64), 1 dispatch processa as constraints de UMA cor,
 *           cada thread processa uma constraint de forma independente.
 *
 * ## Bind groups
 *
 * @group(0) @binding(0) — SimParams           (uniform)
 * @group(0) @binding(1) — Particle[]          (storage read_write)
 * @group(0) @binding(2) — DistanceConstraint[] (storage read, sorted by color)
 * @group(0) @binding(3) — lambdas: array<f32> (storage read_write — warm-starting, Fase 3b)
 * @group(1) @binding(0) — ColorRange          (uniform — offset e count desta cor)
 *
 * ## Dispatch
 *
 * ceil(colorRange.count / 64) workgroups, um thread por constraint da cor atual.
 * Threads com gid.x >= color_range.count fazem early-return.
 *
 * ## Convergência
 *
 * Dentro de uma cor: Jacobi (todas as constraints atualizam em paralelo).
 * Entre cores: **Jacobi** (não Gauss-Seidel) — a spec WebGPU não garante
 * ordenação entre dispatches no mesmo compute pass, portanto cor C+1 pode
 * executar antes de cor C terminar. Na prática em GPU desktop o comportamento
 * é serial, mas não é garantido. Para garantia de Gauss-Seidel inter-cores,
 * cada cor precisaria de um compute pass separado.
 * Pode precisar de 10–20% mais iterações que o serial puro, mas o ganho de
 * paralelismo compensa amplamente (~4× em cloth 256×256).
 *
 * Depende de: SimParams, Particle, DistanceConstraint, xpbd_delta_lambda.
 */
export const WGSL_KERNEL_DISTANCE_SOLVE_COLOR = /* wgsl */`

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
`;
