import type { CollisionResolver }   from '../../../scene/systems/resolution/CollisionResolver';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../scene/systems/resolution/ResolutionConfig';
import type { vec3 }                from 'gl-matrix';
import { ContactImpulseKernel }     from './ContactImpulseKernel';

/**
 * Resolução de colisões por impulso direto — 1 pass por substep.
 *
 * Para cada contato aplica impulso normal (restituição) e tangencial
 * (Coulomb) com correção de posição via Baumgarte.
 *
 * Adequado para colisões isoladas e cenas com poucos empilhamentos.
 * Para pilhas de 3+ corpos, prefira `SequentialImpulseResolver`.
 */
export class ImpulseResolver implements CollisionResolver {
    public readonly restitution:          number;
    public readonly restitutionThreshold: number;
    public readonly friction:             number;
    public readonly baumgarteFactor:      number;
    public readonly penetrationSlop:      number;

    constructor(config: ResolutionConfig = {}) {
        this.restitution          = config.restitution          ?? 0.3;
        this.restitutionThreshold = config.restitutionThreshold ?? 1.0;
        this.friction             = config.friction             ?? 0.5;
        this.baumgarteFactor      = config.baumgarteFactor      ?? 0.4;
        this.penetrationSlop      = config.penetrationSlop      ?? 0.005;
    }

    public resolve(context: PhysicsStageContext, _dt: number): void {
        for (const contact of context.contacts) {
            this.resolveContact(contact, context);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────

    private resolveContact(
        contact: PhysicsStageContext['contacts'][number],
        context: PhysicsStageContext,
    ): void {
        const weight  = contact.weight;
        const entryA  = context.entityBodies.get(contact.entityIdA);
        const entryB  = context.entityBodies.get(contact.entityIdB);
        const dynA    = entryA != null && !entryA.body.get<boolean>('isKinematic');
        const dynB    = entryB != null && !entryB.body.get<boolean>('isKinematic');
        if (!dynA && !dynB) return;

        const { nx, ny, nz, depth, cpx, cpy, cpz } = contact;

        const mA    = dynA ? (entryA!.body.get<number>('mass') ?? 1.0) : 0;
        const mB    = dynB ? (entryB!.body.get<number>('mass') ?? 1.0) : 0;
        const invMA = dynA && mA > 0 ? 1 / mA : 0;
        const invMB = dynB && mB > 0 ? 1 / mB : 0;

        const velA   = dynA ? entryA!.body.get<vec3>('velocity')        : null;
        const velB   = dynB ? entryB!.body.get<vec3>('velocity')        : null;
        const omegaA = dynA ? entryA!.body.get<vec3>('angularVelocity') : null;
        const omegaB = dynB ? entryB!.body.get<vec3>('angularVelocity') : null;
        const posA   = dynA ? entryA!.body.get<vec3>('position')        : null;
        const posB   = dynB ? entryB!.body.get<vec3>('position')        : null;
        const IA     = dynA ? entryA!.body.get<vec3>('inertiaTensor')   : null;
        const IB     = dynB ? entryB!.body.get<vec3>('inertiaTensor')   : null;

        const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
        const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
        const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
        const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
        const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
        const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

        // isMultiContact: suprime angular em contatos face-face (4 pontos).
        // A correção angular em contatos múltiplos pode sobre-estimular rotação.
        const isMultiContact = weight <= 0.25;
        const a = ContactImpulseKernel.axis(
            rAx, rAy, rAz, rBx, rBy, rBz,
            nx, ny, nz,
            invMA, invMB, dynA, dynB,
            isMultiContact ? null : IA,
            isMultiContact ? null : IB,
        );
        if (a.wSum === 0) return;

        // Velocidade relativa no ponto de contato (v_CM + ω × r)
        const oAx = omegaA ? (omegaA[0] ?? 0) : 0;
        const oAy = omegaA ? (omegaA[1] ?? 0) : 0;
        const oAz = omegaA ? (omegaA[2] ?? 0) : 0;
        const oBx = omegaB ? (omegaB[0] ?? 0) : 0;
        const oBy = omegaB ? (omegaB[1] ?? 0) : 0;
        const oBz = omegaB ? (omegaB[2] ?? 0) : 0;
        const vRelX = ContactImpulseKernel.vcpX(velA ? (velA[0] ?? 0) : 0, oAy, oAz, rAy, rAz)
                    - ContactImpulseKernel.vcpX(velB ? (velB[0] ?? 0) : 0, oBy, oBz, rBy, rBz);
        const vRelY = ContactImpulseKernel.vcpY(velA ? (velA[1] ?? 0) : 0, oAx, oAz, rAx, rAz)
                    - ContactImpulseKernel.vcpY(velB ? (velB[1] ?? 0) : 0, oBx, oBz, rBx, rBz);
        const vRelZ = ContactImpulseKernel.vcpZ(velA ? (velA[2] ?? 0) : 0, oAx, oAy, rAx, rAy)
                    - ContactImpulseKernel.vcpZ(velB ? (velB[2] ?? 0) : 0, oBx, oBy, rBx, rBy);
        const vRelN = vRelX * nx + vRelY * ny + vRelZ * nz;

        const eA        = dynA ? (entryA!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
        const eB        = dynB ? (entryB!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
        const e         = Math.min(eA, eB);
        const effectiveE = Math.abs(vRelN) > this.restitutionThreshold ? e : 0;

        const j = -(1.0 + effectiveE) * vRelN / a.wSum * weight;

        // ── Correção de posição (Baumgarte) ────────────────────────────────
        const invSumTrans = invMA + invMB;
        if (invSumTrans > 0) {
            const correctionDepth = Math.max(depth - this.penetrationSlop, 0) * this.baumgarteFactor;
            if (correctionDepth > 0) {
                if (dynA && posA) {
                    const s = (invMA / invSumTrans) * correctionDepth;
                    posA[0] = (posA[0] ?? 0) + nx * s;
                    posA[1] = (posA[1] ?? 0) + ny * s;
                    posA[2] = (posA[2] ?? 0) + nz * s;
                }
                if (dynB && posB) {
                    const s = (invMB / invSumTrans) * correctionDepth;
                    posB[0] = (posB[0] ?? 0) - nx * s;
                    posB[1] = (posB[1] ?? 0) - ny * s;
                    posB[2] = (posB[2] ?? 0) - nz * s;
                }
            }
        }

        if (j <= 0) return;

        if (dynA && entryA!.body.get<boolean>('isSleeping')) entryA!.body.set('isSleeping', false);
        if (dynB && entryB!.body.get<boolean>('isSleeping')) entryB!.body.set('isSleeping', false);

        if (dynA && velA) ContactImpulseKernel.applyScalar(velA, isMultiContact ? null : omegaA, isMultiContact ? null : IA, +1, j, nx, ny, nz, a.rAxDx, a.rAxDy, a.rAxDz, invMA);
        if (dynB && velB) ContactImpulseKernel.applyScalar(velB, isMultiContact ? null : omegaB, isMultiContact ? null : IB, -1, j, nx, ny, nz, a.rBxDx, a.rBxDy, a.rBxDz, invMB);

        // ── Atrito de Coulomb ────────────────────────────────────────────────
        // isMultiContact: usa velocidade linear pura (sem ω×r) para evitar
        // sobre-estimulação rotacional em contatos face-face com 4 pontos.
        const frX = isMultiContact ? (velA ? (velA[0] ?? 0) : 0) - (velB ? (velB[0] ?? 0) : 0) : vRelX;
        const frY = isMultiContact ? (velA ? (velA[1] ?? 0) : 0) - (velB ? (velB[1] ?? 0) : 0) : vRelY;
        const frZ = isMultiContact ? (velA ? (velA[2] ?? 0) : 0) - (velB ? (velB[2] ?? 0) : 0) : vRelZ;
        const muA    = entryA ? (entryA.body.get<number>('friction') ?? this.friction) : this.friction;
        const muB    = entryB ? (entryB.body.get<number>('friction') ?? this.friction) : this.friction;
        const mu     = ContactImpulseKernel.combineMu(muA, muB);
        const jNProxy = -(1.0 + effectiveE) * vRelN / invSumTrans * weight;
        ContactImpulseKernel.applyFriction(
            velA, isMultiContact ? null : omegaA, isMultiContact ? null : IA,
            velB, isMultiContact ? null : omegaB, isMultiContact ? null : IB,
            rAx, rAy, rAz, rBx, rBy, rBz,
            invMA, invMB, dynA, dynB,
            frX, frY, frZ, nx, ny, nz,
            jNProxy, mu,
        );
    }
}
