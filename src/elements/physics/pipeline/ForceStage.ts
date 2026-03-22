import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { Force }               from '../../../scene/systems/forces/Force';
import type { PhysicsSolver }       from '../../../scene/systems/solvers/PhysicsSolver';
import { vec3 } from 'gl-matrix';

/**
 * Estágio 1 do pipeline de física — Acúmulo de forças e integração de velocidade.
 *
 * Para cada corpo dinâmico e acordado:
 *  1. Soma todas as forças globais registradas (ex: gravidade) em `netForce`.
 *  2. Chama o solver correspondente ao tipo do corpo (ex: CPURigidBodySolver),
 *     que aplica `netForce → velocity` via integração de Euler semi-implícita,
 *     e aplica linearDamping e angularDamping para dissipar energia.
 *
 * Corpos cinemáticos (isKinematic) e adormecidos (isSleeping) são ignorados:
 * cinemáticos têm posição controlada externamente; adormecidos estão em repouso.
 *
 * Após este estágio, cada corpo tem sua velocidade atualizada mas sua posição
 * ainda não — a integração de posição ocorre no IntegrationStage (estágio 5).
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
