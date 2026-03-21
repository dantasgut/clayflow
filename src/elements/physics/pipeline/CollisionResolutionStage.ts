import type { PhysicsStage }        from '../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { vec3 } from 'gl-matrix';

export interface CollisionResolutionOptions {
    restitution?: number;
    /**
     * Velocidade relativa mínima (m/s) para aplicar restituição.
     * Abaixo deste limiar usa-se e=0 (colisão perfeitamente inelástica),
     * evitando micro-vibrações em objetos em repouso.
     * Default: 1.0 m/s
     */
    restitutionThreshold?: number;
    /**
     * Coeficiente de atrito de Coulomb (μ).
     * Limita o impulso tangencial a μ * impulso_normal.
     * Default: 0.5
     */
    friction?: number;
}

/**
 * Estágio 4: resolve colisões — impulso normal com dinâmica angular
 * e impulso tangencial de atrito (Coulomb).
 *
 * Impulso normal: j = -(1 + e) * vRelN / (1/mA + 1/mB + angA + angB)
 * Impulso de atrito: jT limitado a μ * j (lei de Coulomb)
 * Corpos cinemáticos têm 1/m = 0 (massa infinita).
 */
export class CollisionResolutionStage implements PhysicsStage {
    private readonly restitution: number;
    private readonly restitutionThreshold: number;
    private readonly friction: number;

    constructor(options: CollisionResolutionOptions = {}) {
        this.restitution          = options.restitution          ?? 0.3;
        this.restitutionThreshold = options.restitutionThreshold ?? 1.0;
        this.friction             = options.friction             ?? 0.5;
    }

    public execute(context: PhysicsStageContext, _dt: number): void {
        for (const contact of context.contacts) {
            const entryA = context.entityBodies.get(contact.entityIdA);
            const entryB = context.entityBodies.get(contact.entityIdB);
            const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
            const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
            if (!dynA && !dynB) continue;

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

            // r × n (para contribuição angular na direção normal)
            const rAxNx = rAy * nz - rAz * ny;
            const rAxNy = rAz * nx - rAx * nz;
            const rAxNz = rAx * ny - rAy * nx;
            const rBxNx = rBy * nz - rBz * ny;
            const rBxNy = rBz * nx - rBx * nz;
            const rBxNz = rBx * ny - rBy * nx;

            // Massa efetiva na direção normal: (r×n) · (I⁻¹ * (r×n))
            const angA = IA
                ? rAxNx * rAxNx / Math.max(IA[0]!, 1e-6)
                + rAxNy * rAxNy / Math.max(IA[1]!, 1e-6)
                + rAxNz * rAxNz / Math.max(IA[2]!, 1e-6) : 0;
            const angB = IB
                ? rBxNx * rBxNx / Math.max(IB[0]!, 1e-6)
                + rBxNy * rBxNy / Math.max(IB[1]!, 1e-6)
                + rBxNz * rBxNz / Math.max(IB[2]!, 1e-6) : 0;

            const invSum = invMA + invMB + angA + angB;
            if (invSum === 0) continue;

            // Velocidade relativa no ponto de contato (linear + angular)
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

            // Restituição por corpo (menor dos dois)
            const eA = dynA ? (entryA!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
            const eB = dynB ? (entryB!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
            const e  = Math.min(eA, eB);
            const effectiveE = Math.abs(vRelN) > this.restitutionThreshold ? e : 0;

            const j = -(1.0 + effectiveE) * vRelN / invSum;

            // Depenetração translacional
            const invSumTrans = invMA + invMB;
            if (invSumTrans > 0) {
                if (dynA && posA) {
                    const s = (invMA / invSumTrans) * depth;
                    posA[0] = (posA[0] ?? 0) + nx * s;
                    posA[1] = (posA[1] ?? 0) + ny * s;
                    posA[2] = (posA[2] ?? 0) + nz * s;
                }
                if (dynB && posB) {
                    const s = (invMB / invSumTrans) * depth;
                    posB[0] = (posB[0] ?? 0) - nx * s;
                    posB[1] = (posB[1] ?? 0) - ny * s;
                    posB[2] = (posB[2] ?? 0) - nz * s;
                }
            }

            if (j <= 0) continue;

            // Acorda corpos adormecidos que recebem impulso
            if (dynA && entryA!.body.get<boolean>('isSleeping')) entryA!.body.set('isSleeping', false);
            if (dynB && entryB!.body.get<boolean>('isSleeping')) entryB!.body.set('isSleeping', false);

            // ── Impulso normal ────────────────────────────────────────────
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
            if (dynA && omegaA && IA) {
                const tAx = rAy * (j * nz) - rAz * (j * ny);
                const tAy = rAz * (j * nx) - rAx * (j * nz);
                const tAz = rAx * (j * ny) - rAy * (j * nx);
                omegaA[0] = (omegaA[0] ?? 0) + tAx / Math.max(IA[0]!, 1e-6);
                omegaA[1] = (omegaA[1] ?? 0) + tAy / Math.max(IA[1]!, 1e-6);
                omegaA[2] = (omegaA[2] ?? 0) + tAz / Math.max(IA[2]!, 1e-6);
            }
            if (dynB && omegaB && IB) {
                const tBx = rBy * (j * nz) - rBz * (j * ny);
                const tBy = rBz * (j * nx) - rBx * (j * nz);
                const tBz = rBx * (j * ny) - rBy * (j * nx);
                omegaB[0] = (omegaB[0] ?? 0) - tBx / Math.max(IB[0]!, 1e-6);
                omegaB[1] = (omegaB[1] ?? 0) - tBy / Math.max(IB[1]!, 1e-6);
                omegaB[2] = (omegaB[2] ?? 0) - tBz / Math.max(IB[2]!, 1e-6);
            }

            // ── Impulso de atrito (Coulomb) ───────────────────────────────
            // Velocidade relativa tangencial após o impulso normal
            const vRelXt = vRelX - vRelN * nx;
            const vRelYt = vRelY - vRelN * ny;
            const vRelZt = vRelZ - vRelN * nz;
            const vRelTLen = Math.sqrt(vRelXt ** 2 + vRelYt ** 2 + vRelZt ** 2);

            if (vRelTLen > 1e-6) {
                // Direção tangencial (oposta ao deslizamento relativo)
                const tx = -vRelXt / vRelTLen;
                const ty = -vRelYt / vRelTLen;
                const tz = -vRelZt / vRelTLen;

                // r × t (contribuição angular na direção tangencial)
                const rAxTx = rAy * tz - rAz * ty;
                const rAxTy = rAz * tx - rAx * tz;
                const rAxTz = rAx * ty - rAy * tx;
                const rBxTx = rBy * tz - rBz * ty;
                const rBxTy = rBz * tx - rBx * tz;
                const rBxTz = rBx * ty - rBy * tx;

                const angFrA = IA
                    ? rAxTx * rAxTx / Math.max(IA[0]!, 1e-6)
                    + rAxTy * rAxTy / Math.max(IA[1]!, 1e-6)
                    + rAxTz * rAxTz / Math.max(IA[2]!, 1e-6) : 0;
                const angFrB = IB
                    ? rBxTx * rBxTx / Math.max(IB[0]!, 1e-6)
                    + rBxTy * rBxTy / Math.max(IB[1]!, 1e-6)
                    + rBxTz * rBxTz / Math.max(IB[2]!, 1e-6) : 0;

                const invSumFr = invMA + invMB + angFrA + angFrB;
                if (invSumFr > 0) {
                    // Impulso necessário para zerar velocidade tangencial, limitado por Coulomb
                    const muA = dynA ? (entryA!.body.get<number>('friction') ?? this.friction) : this.friction;
                    const muB = dynB ? (entryB!.body.get<number>('friction') ?? this.friction) : this.friction;
                    const mu  = Math.min(muA, muB);
                    const jTMax = mu * j;
                    const jT = Math.min(vRelTLen / invSumFr, jTMax);

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
