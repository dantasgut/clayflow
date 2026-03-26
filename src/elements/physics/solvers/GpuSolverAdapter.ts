/**
 * GpuSolverAdapter — adapta GpuRigidBodyPipeline para a interface ISolver.
 *
 * NÃO modifica GpuRigidBodyPipeline. Apenas expõe o contrato ISolver para que
 * SolverRegistry possa criar e gerenciar instâncias GPU de forma uniforme.
 *
 * O GpuRigidBodyPipeline é criado no construtor de forma síncrona, pois ele
 * acede ao WebGPUEngineCore de forma lazy internamente (apenas no primeiro execute()).
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import type { ISolver }            from './ISolver';
import type { RigidBodySimConfig } from '../../../scene/systems/simulation/RigidBodySimConfig';
import type { Force }              from '../../../scene/systems/forces/Force';
import { GpuRigidBodyPipeline }    from '../gpu/GpuRigidBodyPipeline';

/**
 * Adapter GPU SI/XPBD: envolve GpuRigidBodyPipeline em ISolver.
 *
 * O pipeline é criado no construtor para que getPipeline() esteja disponível
 * imediatamente após registry.create(), permitindo ao PhysicsWorld inserir
 * o pipeline no framePipeline sem await.
 */
export class GpuSolverAdapter implements ISolver {
    public readonly name    = 'gpu_si';
    public readonly backend = 'gpu' as const;

    private readonly pipeline: GpuRigidBodyPipeline;

    constructor(
        private readonly config:       RigidBodySimConfig,
        private readonly globalForces: Map<string, Force> = new Map(),
        private readonly getSubsteps:  () => number       = () => 4,
    ) {
        this.pipeline = new GpuRigidBodyPipeline(
            this.globalForces,
            this.getSubsteps,
            this.config.iterations          ?? 15,
            this.config.profilerLogInterval ?? 60,
            this.config,
        );
    }

    public async initialize(_device?: GPUDevice): Promise<void> {
        // Pipeline já criado no construtor; inicialização lazy é gerida internamente
        // por GpuRigidBodyPipeline no primeiro execute().
    }

    public async step(_dt: number): Promise<void> {
        // GpuRigidBodyPipeline.execute() é chamado diretamente pelo PhysicsWorld
        // via framePipeline.execute(). Este método existe para satisfazer ISolver.
    }

    public dispose(): void {
        // GpuRigidBodyPipeline não expõe dispose(); recursos são geridos pelo WebGPUEngineCore.
    }

    /** Retorna o pipeline subjacente (para uso pelo PhysicsWorld no framePipeline). */
    public getPipeline(): GpuRigidBodyPipeline {
        return this.pipeline;
    }
}
