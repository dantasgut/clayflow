/**
 * GpuLcpAdapter — adapta GpuLcpPipeline para a interface ISolver.
 *
 * NÃO modifica GpuLcpPipeline. Apenas expõe o contrato ISolver para que
 * SolverRegistry possa criar e gerenciar instâncias GPU LCP de forma uniforme.
 *
 * O GpuLcpPipeline é criado no construtor de forma síncrona, pois ele
 * acede ao WebGPUEngineCore de forma lazy internamente (apenas no primeiro execute()).
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import type { ISolver }            from './ISolver';
import type { RigidBodySimConfig } from '../../../scene/systems/simulation/RigidBodySimConfig';
import type { Force }              from '../../../scene/systems/forces/Force';
import type { GpuPipelineEventBus } from '../../../scene/systems/gpu/GpuPipelineEventBus';
import { GpuLcpPipeline }          from '../gpu/GpuLcpPipeline';

/**
 * Adapter GPU LCP/PGS: envolve GpuLcpPipeline em ISolver.
 *
 * O pipeline é criado no construtor para que getPipeline() esteja disponível
 * imediatamente após registry.create(), permitindo ao PhysicsWorld inserir
 * o pipeline no framePipeline sem await.
 */
export class GpuLcpAdapter implements ISolver {
    public readonly name    = 'gpu_lcp';
    public readonly backend = 'gpu' as const;

    private readonly pipeline: GpuLcpPipeline;

    constructor(
        private readonly config:       RigidBodySimConfig,
        private readonly globalForces: Map<string, Force> = new Map(),
        private readonly getSubsteps:  () => number       = () => 4,
        private readonly eventBus?:    GpuPipelineEventBus,
    ) {
        this.pipeline = new GpuLcpPipeline(
            this.globalForces,
            this.getSubsteps,
            this.config.iterations          ?? 15,
            this.config.profilerLogInterval ?? 60,
            this.config,
            this.eventBus,
        );
    }

    public async initialize(_device?: GPUDevice): Promise<void> {
        // Pipeline já criado no construtor; inicialização lazy é gerida internamente
        // por GpuLcpPipeline no primeiro execute().
    }

    public async step(_dt: number): Promise<void> {
        // GpuLcpPipeline.execute() é chamado diretamente pelo PhysicsWorld
        // via framePipeline.execute(). Este método existe para satisfazer ISolver.
    }

    public dispose(): void {
        // GpuLcpPipeline não expõe dispose(); recursos são geridos pelo WebGPUEngineCore.
    }

    /** Retorna o pipeline subjacente (para uso pelo PhysicsWorld no framePipeline). */
    public getPipeline(): GpuLcpPipeline {
        return this.pipeline;
    }
}
