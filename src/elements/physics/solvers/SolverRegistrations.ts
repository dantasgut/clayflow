/**
 * SolverRegistrations — registra todos os solvers disponíveis no SolverRegistry.
 *
 * Deve ser importado uma única vez na inicialização do engine (ex: PhysicsWorld).
 * Registra tanto os solvers CPU existentes quanto o solver GPU LCP.
 *
 * Chaves registradas:
 *   'cpu_si'          — Sequential Impulse (CPU, padrão)
 *   'cpu_xpbd'        — XPBD (CPU)
 *   'cpu_impulse'     — Impulse simples (CPU)
 *   'gpu_lcp'         — LCP/PGS (GPU, compute shaders WGSL)
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import { SolverRegistry }    from './SolverRegistry';
import { CpuSolverAdapter }  from './CpuSolverAdapter';
import { GpuSolverAdapter }  from './GpuSolverAdapter';
import { GpuLcpAdapter }     from './GpuLcpAdapter';

let _registered = false;

/**
 * Registra todos os solvers no Singleton SolverRegistry.
 * Idempotente — chamadas repetidas são no-op.
 */
export function registerAllSolvers(): void {
    if (_registered) return;
    _registered = true;

    const registry = SolverRegistry.getInstance();

    // ── CPU solvers ────────────────────────────────────────────────────────
    registry.register('cpu_si',      (cfg) => new CpuSolverAdapter(cfg));
    registry.register('cpu_xpbd',    (cfg) => new CpuSolverAdapter(cfg));
    registry.register('cpu_impulse', (cfg) => new CpuSolverAdapter(cfg));

    // ── GPU solvers ────────────────────────────────────────────────────────
    registry.register('gpu_si',      (cfg) => new GpuSolverAdapter(cfg));
    registry.register('gpu_lcp',     (cfg) => new GpuLcpAdapter(cfg));
}
