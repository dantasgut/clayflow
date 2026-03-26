/**
 * GpuSolverAdapter — adapta GpuRigidBodyPipeline para a interface ISolver.
 *
 * NÃO modifica GpuRigidBodyPipeline. Apenas expõe o contrato ISolver para que
 * SolverRegistry possa criar e gerenciar instâncias GPU de forma uniforme.
 *
 * Nota: GpuRigidBodyPipeline implementa PhysicsStage e é gerenciado pelo
 * PhysicsWorld via framePipeline. Este adapter é usado apenas quando o solver
 * é criado via SolverRegistry (cenário de configuração programática futura).
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import type { ISolver }            from './ISolver';
import type { RigidBodySimConfig } from '../../../scene/systems/simulation/RigidBodySimConfig';
import type { Force }              from '../../../scene/systems/forces/Force';

/**
 * Adapter GPU: envolve GpuRigidBodyPipeline em ISolver.
 *
 * A criação do GpuRigidBodyPipeline é lazy (no initialize()) porque o
 * WebGPUEngineCore pode não estar disponível no momento da construção.
 */
export class GpuSolverAdapter implements ISolver {
    public readonly name    = 'gpu_lcp';
    public readonly backend = 'gpu' as const;

    private pipeline: import('../gpu/GpuRigidBodyPipeline').GpuRigidBodyPipeline | null = null;
    private initialized = false;

    constructor(
        private readonly config:       RigidBodySimConfig,
        private readonly globalForces: Map<string, Force> = new Map(),
        private readonly getSubsteps:  () => number       = () => 4,
    ) {}

    public async initialize(_device?: GPUDevice): Promise<void> {
        if (this.initialized) return;
        const { GpuRigidBodyPipeline } = await import('../gpu/GpuRigidBodyPipeline');
        this.pipeline = new GpuRigidBodyPipeline(
            this.globalForces,
            this.getSubsteps,
            this.config.iterations        ?? 15,
            this.config.profilerLogInterval ?? 60,
            this.config,
        );
        this.initialized = true;
    }

    public async step(_dt: number): Promise<void> {
        // GpuRigidBodyPipeline.execute() é chamado diretamente pelo PhysicsWorld
        // via framePipeline.execute(). Este método existe para satisfazer ISolver.
    }

    public dispose(): void {
        this.pipeline = null;
        this.initialized = false;
    }

    /** Retorna o pipeline subjacente (para uso pelo PhysicsWorld). */
    public getPipeline(): import('../gpu/GpuRigidBodyPipeline').GpuRigidBodyPipeline | null {
        return this.pipeline;
    }
}
