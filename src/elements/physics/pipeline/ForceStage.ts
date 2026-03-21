import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { Force }               from '../../../scene/systems/forces/Force';
import type { PhysicsSolver }       from '../../../scene/systems/solvers/PhysicsSolver';
import { vec3 } from 'gl-matrix';

/**
 * Estágio 1: acumula forças globais e executa solvers de velocidade.
 * Responsabilidade única: v += (F/m) * dt para cada corpo dinâmico.
 */
export class ForceStage implements PhysicsStage {
    constructor(
        private readonly forces:  ReadonlyMap<string, Force>,
        private readonly solvers: ReadonlyMap<string, PhysicsSolver>,
    ) {}

    public execute(context: PhysicsStageContext, dt: number): void {
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic') || body.get<boolean>('isSleeping')) continue;
            if (this.forces.size > 0) {
                const net = vec3.create();
                for (const force of this.forces.values()) {
                    vec3.add(net, net, force.compute(body, dt));
                }
                body.set('netForce', net);
            }
            const solver = this.solvers.get(body.physicType);
            if (solver) solver.solve(body, dt);

        }
    }
}
