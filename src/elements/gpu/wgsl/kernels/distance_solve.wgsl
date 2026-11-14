// portado de legacy/elements/physics/gpu/wgsl/kernels/distance_solve.wgsl.ts
// Restrições de distância (XPBD) por cor (spec 034, T061b). As arestas de um corpo vêm coloridas da criação (as da
// mesma cor não compartilham partícula) e cada corpo é resolvido por um grupo de trabalho (`distance_solve_body_main`,
// um grupo por faixa `SoftBodyRange`): as invocações dividem as arestas da cor corrente, e uma barreira separa as cores
// e as iterações (Gauss-Seidel por cor) — um despacho por substep. As avulsas (`XPBD_SERIAL_COLOR`, que ligam
// partículas de qualquer corpo) vão uma a uma (`distance_solve_serial_main`, uma invocação).
// Antes, uma invocação percorria todas as restrições de todos os corpos a cada substep: o pano de 32 × 32 custava 15 ms
// por quadro com uma iteração, e com uma só ele não convergia — a correção pendente virava velocidade e o pano ganhava
// energia (girava por cima dos pinos).

const XPBD_SERIAL_COLOR: u32 = 15u;
/** O algoritmo XPBD na faixa (`SoftBodyRange.algorithm`). */
const XPBD_RANGE_ALGORITHM: u32 = 1u;
/** Teto das iterações por substep e das rodadas de arestas por invocação (orçamento dos laços). */
const XPBD_MAX_ITERATIONS: u32 = 16u;
const XPBD_EDGE_ROUNDS: u32 = 4096u;
/** Teto das restrições percorridas pela invocação serial (orçamento do laço). */
const XPBD_SERIAL_BUDGET: u32 = 4194304u;
/** Invocações do grupo de um corpo (o máximo portátil por grupo): mais invocações dividem cada cor. */
const XPBD_BODY_THREADS: u32 = 256u;

var<workgroup> xpbd_body_first: u32;
var<workgroup> xpbd_body_edges: u32;
var<workgroup> xpbd_body_colors: u32;
/** Início de cada cor nas arestas do corpo (as arestas vêm ordenadas por cor da criação); a última, o fim. */
var<workgroup> xpbd_color_start: array<u32, 16>;

/** Resolve a restrição `ci` (viva, entre partículas vivas). */
fn distance_solve_one(ci: u32, dt2: f32) {
    let c = constraints[ci];
    // Slot livre do pool de restrições, ou restrição que aponta para slot livre (corpo removido antes): ignorada.
    if (!pool_live(constraint_live[ci >> 5u], ci)) { return; }
    if (!pool_live(live[c.i >> 5u], c.i) || !pool_live(live[c.j >> 5u], c.j)) { return; }
    let pA = particles[c.i].pred.xyz;
    let pB = particles[c.j].pred.xyz;

    let diff = pB - pA;
    let dist = length(diff);
    if (dist < 1e-8) { return; }  // partículas coincidentes — skip

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

/** As arestas do corpo de cada grupo (um grupo por faixa), uma cor depois da outra, `params.constraint_iterations` vezes. */
@compute @workgroup_size(256)
fn distance_solve_body_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lid: u32,
) {
    let dt2 = params.dt * params.dt;
    // Índice linear (Dispatcher.invocations: os grupos em x/y); o grupo é o corpo.
    let body = (gid3.x + gid3.y * nwg.x * 256u) / XPBD_BODY_THREADS;
    if (lid == 0u) {
        let r = xpbd_ranges[min(body, arrayLength(&xpbd_ranges) - 1u)];
        let solving = body < arrayLength(&xpbd_ranges) && r.algorithm == XPBD_RANGE_ALGORITHM && r.edge_count > 0u;
        xpbd_body_first = r.first_edge;
        xpbd_body_edges = select(0u, r.edge_count, solving);
        xpbd_body_colors = select(0u, min(r.edge_colors, XPBD_SERIAL_COLOR), solving);
    }
    // Uniformes no grupo (as barreiras do laço pedem o mesmo caminho em todas as invocações).
    let edges = workgroupUniformLoad(&xpbd_body_edges);
    let colors = workgroupUniformLoad(&xpbd_body_colors);
    let first = workgroupUniformLoad(&xpbd_body_first);
    // Os trechos das cores: onde a cor muda nas arestas ordenadas.
    if (lid == 0u) { xpbd_color_start[colors] = edges; }
    for (var t = 0u; t < XPBD_EDGE_ROUNDS; t++) {
        let k = lid + t * XPBD_BODY_THREADS;
        if (k >= edges) { break; }
        let c = constraints[first + k].color;
        if (c < XPBD_SERIAL_COLOR && (k == 0u || constraints[first + k - 1u].color != c)) { xpbd_color_start[c] = k; }
    }
    workgroupBarrier();
    for (var it = 0u; it < XPBD_MAX_ITERATIONS; it++) {
        if (it >= params.constraint_iterations) { break; }
        for (var color = 0u; color < XPBD_SERIAL_COLOR; color++) {
            if (color >= colors) { break; }
            let begin = xpbd_color_start[color];
            let end = xpbd_color_start[color + 1u];
            for (var t = 0u; t < XPBD_EDGE_ROUNDS; t++) {
                let k = begin + lid + t * XPBD_BODY_THREADS;
                if (k >= end) { break; }
                distance_solve_one(first + k, dt2);
            }
            // A cor seguinte vê as posições desta (Gauss-Seidel por cor).
            storageBarrier();
            workgroupBarrier();
        }
    }
}

/** As restrições avulsas (`XPBD_SERIAL_COLOR`), uma a uma, `params.constraint_iterations` vezes (uma invocação). */
@compute @workgroup_size(1)
fn distance_solve_serial_main() {
    let dt2 = params.dt * params.dt;
    for (var it = 0u; it < XPBD_MAX_ITERATIONS; it++) {
        if (it >= params.constraint_iterations) { break; }
        for (var k = 0u; k < XPBD_SERIAL_BUDGET; k++) {
            if (k >= params.constraint_count) { break; }
            if (constraints[k].color == XPBD_SERIAL_COLOR) { distance_solve_one(k, dt2); }
        }
    }
}
