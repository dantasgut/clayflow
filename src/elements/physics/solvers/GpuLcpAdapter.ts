/**
 * GpuLcpAdapter — adapta GpuLcpPipeline para a interface ISolver.
 *
 * NÃO modifica GpuLcpPipeline. Apenas expõe o contrato ISolver para que
 * SolverRegistry possa criar e gerenciar instâncias GPU LCP de forma uniforme.
 *
 * Análogo ao GpuSolverAdapter, mas envolve GpuLcpPipeline em vez de GpuRigidBodyPipeline.
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import type { ISolver }            from './ISolver';
import type { RigidBodySimConfig } from '../../../scene/systems/simulation/RigidBodySimConfig';
import type { Force }              from '../../../scene/systems/forces/Force';

/**
 * Adapter GPU LCP: envolve GpuLcpPipeline em ISolver.
 *
 * A criação do GpuLcpPipeline é lazy (no initialize()) porque o
 * WebGPUEngineCore pode não estar disponível no momento da construção.
 */
export class GpuLcpAdapter implements ISolver {
    public readonly name    = 'gpu_lcp_pgs';
    public readonly backend = 'gpu' as const;

    private pipeline: import('../gpu/GpuLcpPipeline').GpuLcpPipeline | null = null;
    private initialized = false;

    constructor(
        private readonly config:       RigidBodySimConfig,
        private readonly globalForces: Map<string, Force> = new Map(),
        private readonly getSubsteps:  () => number       = () => 4,
    ) {}

    public async initialize(_device?: GPUDevice): Promise<void> {
        if (this.initialized) return;
        const { GpuLcpPipeline } = await import('../gpu/GpuLcpPipeline');
        this.pipeline = new GpuLcpPipeline(
            this.globalForces,
            this.getSubsteps,
            this.config.iterations          ?? 15,
            this.config.profilerLogInterval ?? 60,
            this.config,
        );
        this.initialized = true;
    }

    public async step(_dt: number): Promise<void> {
        // GpuLcpPipeline.execute() é chamado diretamente pelo PhysicsWorld
        // via framePipeline.execute(). Este método existe para satisfazer ISolver.
    }

    public dispose(): void {
        this.pipeline = null;
        this.initialized = false;
    }

    /** Retorna o pipeline subjacente (para uso pelo PhysicsWorld). */
    public getPipeline(): import('../gpu/GpuLcpPipeline').GpuLcpPipeline | null {
        return this.pipeline;
    }
}
