import type { CollisionResolver }   from '../../../scene/systems/resolution/CollisionResolver';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../scene/systems/resolution/ResolutionConfig';
import type { vec3 }                from 'gl-matrix';

/**
 * Resolução de colisões por impulso direto — 1 pass por substep.
 *
 * Implementação original do motor: para cada contato aplica impulso normal
 * (restituição) e tangencial (Coulomb) com correção de posição via Baumgarte.
 *
 * Adequado para colisões isoladas e cenas com poucos empilhamentos.
 * Para pilhas de 3+ corpos, prefira SequentialImpulseResolver.
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
            ImpulseResolver.resolveContact(contact, context, this);
        }
    }

    // Exposto como estático para ser reutilizado pelo SequentialImpulseResolver
    // no cálculo da massa efetiva e da velocidade relativa.
    public static resolveContact(
        contact: PhysicsStageContext['contacts'][number],
        context: PhysicsStageContext,
        cfg: {
            restitution: number;
            restitutionThreshold: number;
            friction: number;
            baumgarteFactor: number;
            penetrationSlop: number;
        },
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

        // Vetores do CM ao ponto de contato
        const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
        const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
        const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
        const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
        const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
        const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

        const rAxNx = rAy * nz - rAz * ny;
        const rAxNy = rAz * nx - rAx * nz;
        const rAxNz = rAx * ny - rAy * nx;
        const rBxNx = rBy * nz - rBz * ny;
        const rBxNy = rBz * nx - rBx * nz;
        const rBxNz = rBx * ny - rBy * nx;

        const isMultiContact = weight <= 0.25;
        const angA = (!isMultiContact && IA)
            ? rAxNx * rAxNx / Math.max(IA[0]!, 1e-6)
            + rAxNy * rAxNy / Math.max(IA[1]!, 1e-6)
            + rAxNz * rAxNz / Math.max(IA[2]!, 1e-6) : 0;
        const angB = (!isMultiContact && IB)
            ? rBxNx * rBxNx / Math.max(IB[0]!, 1e-6)
            + rBxNy * rBxNy / Math.max(IB[1]!, 1e-6)
            + rBxNz * rBxNz / Math.max(IB[2]!, 1e-6) : 0;

        const invSum = invMA + invMB + angA + angB;
        if (invSum === 0) return;

        const vAxcp = (velA ? (velA[0] ?? 0) : 0) + (omegaA ? ((omegaA[1] ?? 0) * rAz - (omegaA[2] ?? 0) * rAy) : 0);
        const vAycp = (velA ? (velA[1] ?? 0) : 0) + (omegaA ? ((omegaA[2] ?? 0) * rAx - (omegaA[0] ?? 0) * rAz) : 0);
        const vAzcp = (velA ? (velA[2] ?? 0) : 0) + (omegaA ? ((omegaA[0] ?? 0) * rAy - (omegaA[1] ?? 0) * rAx) : 0);
        const vBxcp = (velB ? (velB[0] ?? 0) : 0) + (omegaB ? ((omegaB[1] ?? 0) * rBz - (omegaB[2] ?? 0) * rBy) : 0);
        const vBycp = (velB ? (velB[1] ?? 0) : 0) + (omegaB ? ((omegaB[2] ?? 0) * rBx - (omegaB[0] ?? 0) * rBz) : 0);
        const vBzcp = (velB ? (velB[2] ?? 0) : 0) + (omegaB ? ((omegaB[0] ?? 0) * rBy - (omegaB[1] ?? 0) * rBx) : 0);

        const vRelX = vAxcp - vBxcp;
        const vRelY = vAycp - vBycp;
        const vRelZ = vAzcp - vBzcp;
        const vRelN = vRelX * nx + vRelY * ny + vRelZ * nz;

        const eA        = dynA ? (entryA!.body.get<number>('restitution') ?? cfg.restitution) : cfg.restitution;
        const eB        = dynB ? (entryB!.body.get<number>('restitution') ?? cfg.restitution) : cfg.restitution;
        const e         = Math.min(eA, eB);
        const effectiveE = Math.abs(vRelN) > cfg.restitutionThreshold ? e : 0;

        const j = -(1.0 + effectiveE) * vRelN / invSum * weight;

        const invSumTrans = invMA + invMB;
        if (invSumTrans > 0) {
            const correctionDepth = Math.max(depth - cfg.penetrationSlop, 0) * cfg.baumgarteFactor;
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

        if (dynA && velA) {
            velA[0] = (velA[0] ?? 0) + j * invMA * nx;
            velA[1] = (velA[1] ?? 0) + j * invMA * ny;
            velA[2] = (velA[2] ?? 0) + j * invMA * nz;
        }
        if (dynB && velB) {
            velB[0] = (velB[0] ?? 0) - j * invMB * nx;
            velB[1] = (velB[1] ?? 0) - j * invMB * ny;
            velB[2] = (velB[2] ?? 0) - j * invMB * nz;
        }

        const jAngular = isMultiContact ? 0 : j;
        if (jAngular > 0) {
            if (dynA && omegaA && IA) {
                omegaA[0] = (omegaA[0] ?? 0) + (rAy * (jAngular * nz) - rAz * (jAngular * ny)) / Math.max(IA[0]!, 1e-6);
                omegaA[1] = (omegaA[1] ?? 0) + (rAz * (jAngular * nx) - rAx * (jAngular * nz)) / Math.max(IA[1]!, 1e-6);
                omegaA[2] = (omegaA[2] ?? 0) + (rAx * (jAngular * ny) - rAy * (jAngular * nx)) / Math.max(IA[2]!, 1e-6);
            }
            if (dynB && omegaB && IB) {
                omegaB[0] = (omegaB[0] ?? 0) - (rBy * (jAngular * nz) - rBz * (jAngular * ny)) / Math.max(IB[0]!, 1e-6);
                omegaB[1] = (omegaB[1] ?? 0) - (rBz * (jAngular * nx) - rBx * (jAngular * nz)) / Math.max(IB[1]!, 1e-6);
                omegaB[2] = (omegaB[2] ?? 0) - (rBx * (jAngular * ny) - rBy * (jAngular * nx)) / Math.max(IB[2]!, 1e-6);
            }
        }

        // ── Atrito de Coulomb ────────────────────────────────────────────────
        const frX = isMultiContact ? (velA ? (velA[0] ?? 0) : 0) - (velB ? (velB[0] ?? 0) : 0) : vRelX;
        const frY = isMultiContact ? (velA ? (velA[1] ?? 0) : 0) - (velB ? (velB[1] ?? 0) : 0) : vRelY;
        const frZ = isMultiContact ? (velA ? (velA[2] ?? 0) : 0) - (velB ? (velB[2] ?? 0) : 0) : vRelZ;
        const frN      = frX * nx + frY * ny + frZ * nz;
        const vRelXt   = frX - frN * nx;
        const vRelYt   = frY - frN * ny;
        const vRelZt   = frZ - frN * nz;
        const vRelTLen = Math.sqrt(vRelXt ** 2 + vRelYt ** 2 + vRelZt ** 2);

        if (vRelTLen > 1e-6) {
            const tx = -vRelXt / vRelTLen;
            const ty = -vRelYt / vRelTLen;
            const tz = -vRelZt / vRelTLen;

            const rAxTx = rAy * tz - rAz * ty;
            const rAxTy = rAz * tx - rAx * tz;
            const rAxTz = rAx * ty - rAy * tx;
            const rBxTx = rBy * tz - rBz * ty;
            const rBxTy = rBz * tx - rBx * tz;
            const rBxTz = rBx * ty - rBy * tx;

            const angFrA = (!isMultiContact && IA)
                ? rAxTx * rAxTx / Math.max(IA[0]!, 1e-6)
                + rAxTy * rAxTy / Math.max(IA[1]!, 1e-6)
                + rAxTz * rAxTz / Math.max(IA[2]!, 1e-6) : 0;
            const angFrB = (!isMultiContact && IB)
                ? rBxTx * rBxTx / Math.max(IB[0]!, 1e-6)
                + rBxTy * rBxTy / Math.max(IB[1]!, 1e-6)
                + rBxTz * rBxTz / Math.max(IB[2]!, 1e-6) : 0;

            const invSumFr = invMA + invMB + angFrA + angFrB;
            if (invSumFr > 0) {
                const muA  = entryA ? (entryA.body.get<number>('friction') ?? cfg.friction) : cfg.friction;
                const muB  = entryB ? (entryB.body.get<number>('friction') ?? cfg.friction) : cfg.friction;
                const mu   = Math.min(muA, muB);
                const jTMax = mu * (-(1.0 + effectiveE) * vRelN / invSumTrans * weight);
                const jT    = Math.min(vRelTLen / invSumFr, jTMax);

                if (dynA && velA) {
                    velA[0] = (velA[0] ?? 0) + jT * invMA * tx;
                    velA[1] = (velA[1] ?? 0) + jT * invMA * ty;
                    velA[2] = (velA[2] ?? 0) + jT * invMA * tz;
                }
                if (dynB && velB) {
                    velB[0] = (velB[0] ?? 0) - jT * invMB * tx;
                    velB[1] = (velB[1] ?? 0) - jT * invMB * ty;
                    velB[2] = (velB[2] ?? 0) - jT * invMB * tz;
                }
                if (!isMultiContact) {
                    if (dynA && omegaA && IA) {
                        omegaA[0] = (omegaA[0] ?? 0) + (rAy * (jT * tz) - rAz * (jT * ty)) / Math.max(IA[0]!, 1e-6);
                        omegaA[1] = (omegaA[1] ?? 0) + (rAz * (jT * tx) - rAx * (jT * tz)) / Math.max(IA[1]!, 1e-6);
                        omegaA[2] = (omegaA[2] ?? 0) + (rAx * (jT * ty) - rAy * (jT * tx)) / Math.max(IA[2]!, 1e-6);
                    }
                    if (dynB && omegaB && IB) {
                        omegaB[0] = (omegaB[0] ?? 0) - (rBy * (jT * tz) - rBz * (jT * ty)) / Math.max(IB[0]!, 1e-6);
                        omegaB[1] = (omegaB[1] ?? 0) - (rBz * (jT * tx) - rBx * (jT * tz)) / Math.max(IB[1]!, 1e-6);
                        omegaB[2] = (omegaB[2] ?? 0) - (rBx * (jT * ty) - rBy * (jT * tx)) / Math.max(IB[2]!, 1e-6);
                    }
                }
            }
        }
    }
}
