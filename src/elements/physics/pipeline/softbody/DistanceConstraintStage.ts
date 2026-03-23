import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';

/**
 * Estágio 3 do pipeline XPBD SoftBody — Solve de constraints de distância.
 *
 * Para cada constraint (aresta da malha), corrige as posições previstas
 * das duas partículas para satisfazer |pj - pi| = restLength.
 *
 * Fórmula XPBD (Müller et al. 2020):
 *   C  = |Δp| - restLength
 *   α̃  = compliance / dt²
 *   Δλ = -C / (wi + wj + α̃)
 *   pi += +wi · Δλ · n̂
 *   pj += -wj · Δλ · n̂
 *
 * Múltiplas iterações convergem constraints interdependentes (malhas densas).
 */
export class DistanceConstraintStage implements PhysicsStage {
    private readonly iterations: number;

    constructor(iterations = 10) {
        this.iterations = iterations;
    }

    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        const dt2 = dt * dt;

        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            const sb = body as unknown as SoftBody;
            if (sb.particles.length === 0 || sb.constraints.length === 0) continue;

            // invMass real derivado do property bag — efetivo a qualquer momento
            const mass       = body.get<number>('mass') ?? 1.0;
            const pInvMass   = sb.particles.length / mass;

            for (let iter = 0; iter < this.iterations; iter++) {
                for (const c of sb.constraints) {
                    const pA = sb.particles[c.i];
                    const pB = sb.particles[c.j];
                    if (!pA || !pB) continue;

                    const wA = pA.w === 0 ? 0 : pInvMass;
                    const wB = pB.w === 0 ? 0 : pInvMass;

                    const dx = pB.px - pA.px;
                    const dy = pB.py - pA.py;
                    const dz = pB.pz - pA.pz;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < 1e-8) continue;

                    const C      = dist - c.restLength;
                    const αTilde = c.compliance / dt2;
                    const wSum   = wA + wB + αTilde;
                    if (wSum < 1e-12) continue;

                    const Δλ = -C / wSum;
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const nz = dz / dist;

                    pA.px -= wA * Δλ * nx;
                    pA.py -= wA * Δλ * ny;
                    pA.pz -= wA * Δλ * nz;

                    pB.px += wB * Δλ * nx;
                    pB.py += wB * Δλ * ny;
                    pB.pz += wB * Δλ * nz;
                }
            }
        }
    }
}
