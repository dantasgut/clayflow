/**
 * CpuSolverAdapter — adapta CPURigidBodySolver para a interface ISolver.
 *
 * NÃO modifica CPURigidBodySolver. Apenas expõe o contrato ISolver para que
 * SolverRegistry possa criar e gerenciar instâncias CPU de forma uniforme.
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import type { ISolver }            from './ISolver';
import type { RigidBodySimConfig } from '../../../scene/systems/simulation/RigidBodySimConfig';
import { CPURigidBodySolver }      from './CPURigidBodySolver';

/**
 * Adapter CPU: envolve CPURigidBodySolver em ISolver.
 *
 * CPURigidBodySolver.solve() opera por corpo (per-body), portanto step()
 * é um no-op neste adapter (o PhysicsWorld usa o solver via setSolver()).
 */
export class CpuSolverAdapter implements ISolver {
    public readonly name    = 'cpu_rigid_body';
    public readonly backend = 'cpu' as const;

    public readonly solver: CPURigidBodySolver;

    constructor(
        private readonly _config: RigidBodySimConfig,
    ) {
        this.solver = new CPURigidBodySolver();
    }

    public async initialize(_device?: GPUDevice): Promise<void> {
        // CPURigidBodySolver não requer inicialização assíncrona.
    }

    public async step(_dt: number): Promise<void> {
        // CPURigidBodySolver.solve() é chamado per-body pelo ForceStage/PhysicsWorld.
        // Este método existe para satisfazer ISolver.
    }

    public dispose(): void {
        // CPURigidBodySolver não aloca recursos externos.
    }
}
