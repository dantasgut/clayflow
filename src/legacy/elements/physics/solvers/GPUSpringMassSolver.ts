import type { PhysicsSolver } from '../../../scene/systems/solvers/PhysicsSolver';
import type { PhysicsBody } from '../../../scene/components/physics/PhysicsBody';
import type { ComputeManager } from '../../../core/interfaces/ComputeManager';

/**
 * Solver GPU para corpos deformáveis (spring-mass via Compute Shader).
 * Implementa o lado "Implementação" do padrão Bridge.
 */
export class GPUSpringMassSolver implements PhysicsSolver {
    public readonly id = 'gpu_spring_mass';

    private readonly compute: ComputeManager;

    constructor(compute: ComputeManager) {
        this.compute = compute;
    }

    public solve(body: PhysicsBody, _dt: number): void {
        const posId = body.get<string>('positionsBufferId');
        const velId = body.get<string>('velocitiesBufferId');
        if (!posId || !velId) return;

        // TODO: obter encoder via ComputeManager e disparar compute shader
        // compute.dispatch('softbody_integrate', bindGroup, workgroups)
    }
}
