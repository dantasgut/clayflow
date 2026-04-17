import type { EngineCore }   from '../../core/interfaces/EngineCore';
import type { GpuSimContext } from './GpuSimContext';

/**
 * Contrato de um compute pass de física GPU (substitui `PhysicsStage`).
 *
 * Diferenças em relação a `PhysicsStage`:
 * - Sem `beginFrame()` — warm starting e caches são internos ao pass.
 * - `dt` é sempre o dt do frame completo; substeps são internos ao pass.
 * - `ensureReady()` encapsula a compilação assíncrona de pipelines WGSL.
 * - `dispose()` libera todos os buffers GPU gerenciados pelo pass.
 *
 * O `passId` corresponde ao algoritmo numérico, não ao tipo de corpo:
 *   'rb_xpbd' — XPBD para RigidBody
 *   'rb_lcp'  — LCP/PGS para RigidBody
 *   'sb_xpbd' — XPBD para SoftBody (partículas + constraints)
 */
export interface PhysicsComputePass {
    /** ID estável do algoritmo. Usado por GpuComputePassRegistry para associar corpos. */
    readonly passId: string;

    /**
     * physicTypes que este pass aceita.
     * Ex: `['RigidBody']` para passes de corpo rígido.
     * Deve corresponder a `PhysicsBody.physicType` dos corpos a processar.
     */
    readonly acceptedPhysicTypes: readonly string[];

    /**
     * Garante que os pipelines WGSL estão compilados e prontos.
     * Idempotente — chamado antes do primeiro `execute()`.
     */
    ensureReady(core: EngineCore): Promise<void>;

    /**
     * Executa os dispatches deste pass para o frame atual.
     * Só chamado quando `ensureReady()` tiver resolvido com sucesso.
     */
    execute(context: GpuSimContext, dt: number): void;

    /**
     * Libera todos os buffers GPU gerenciados por este pass.
     * Chamado quando o pass é removido do registry ou a cena é desconectada.
     */
    dispose(): void;
}
