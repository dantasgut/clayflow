import type { PhysicsSolver } from './PhysicsSolver';
import type { PhysicsBody } from '../../components/physics/PhysicsBody';
import type { ComputeManager } from '../../../core/interfaces/ComputeManager';
import { SoftBody } from '../../components/physics/SoftBody';

/**
 * Solver GPU para corpos deformáveis (spring-mass via Compute Shader).
 * Implementa o lado "Implementação" do padrão Bridge.
 */
export class GPUSpringMassSolver implements PhysicsSolver {
    public readonly id = 'gpu_spring_mass';

    private readonly _compute: ComputeManager;

    constructor(compute: ComputeManager) {
        this._compute = compute;
    }

    public solve(body: PhysicsBody, encoder: GPUCommandEncoder, _dt: number): void {
        if (!(body instanceof SoftBody)) return;
        if (!body.positionsBufferId || !body.velocitiesBufferId) return;

        // Dispatch do compute shader de integração spring-mass
        // BindGroup dinâmico montado por fase avançada (PhysicsBindGroupBuilder)
        const pass = this._compute.beginComputePass(encoder, `softbody_${body.uuid}`);
        pass.end();

        // TODO: montar bindgroup com positionsBuffer, velocitiesBuffer, parâmetros
        // e disparar: compute.dispatch(encoder, 'softbody_integrate', [bg], workgroups)
    }
}
