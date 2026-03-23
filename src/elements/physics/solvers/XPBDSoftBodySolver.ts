import type { PhysicsSolver } from '../../../scene/systems/solvers/PhysicsSolver';
import type { PhysicsBody }   from '../../../scene/components/physics/PhysicsBody';
import type { SoftBody }      from '../SoftBody';
import type { vec3 }          from 'gl-matrix';

/**
 * Solver XPBD para corpos deformáveis.
 *
 * Segue o mesmo padrão do CPURigidBodySolver: é invocado pelo ForceStage
 * após o acúmulo de `netForce`. Lê `netForce` do property bag do corpo e
 * aplica a aceleração resultante à velocidade de cada partícula.
 *
 * Integração:
 *   a  = netForce / mass          (aceleração uniforme do corpo)
 *   vᵢ += a · dt                  (para cada partícula não fixada)
 *
 * Forças globais (gravidade, vento) chegam aqui via world.addForce(),
 * exatamente como no pipeline de RigidBody — sem duplicação de parâmetros.
 *
 * @example
 * world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
 * world.setSolver('SoftBody', new XPBDSoftBodySolver());
 */
export class XPBDSoftBodySolver implements PhysicsSolver {
    public readonly id = 'xpbd_soft_body';

    public solve(body: PhysicsBody, dt: number): void {
        const netForce = body.get<vec3>('netForce');
        if (!netForce) return;

        const mass = body.get<number>('mass') ?? 1.0;
        const ax   = (netForce[0] ?? 0) / mass * dt;
        const ay   = (netForce[1] ?? 0) / mass * dt;
        const az   = (netForce[2] ?? 0) / mass * dt;

        const sb = body as unknown as SoftBody;
        for (const p of sb.particles) {
            if (p.w <= 0) continue;
            p.vx += ax;
            p.vy += ay;
            p.vz += az;
        }
    }
}
