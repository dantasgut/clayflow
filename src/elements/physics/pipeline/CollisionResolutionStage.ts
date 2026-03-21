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
}

/**
 * Estágio 4: resolve colisões — impulso com dinâmica angular, massa correta e depenetração proporcional.
 *
 * Fórmula de impulso: j = -(1 + e) * vRelN / (1/mA + 1/mB + angA + angB)
 * Corpos cinemáticos têm 1/m = 0 (massa infinita).
 * Suporta restitution por corpo (usa o menor dos dois).
 */
export class CollisionResolutionStage implements PhysicsStage {
    private readonly restitution: number;
    private readonly restitutionThreshold: number;

    constructor(options: CollisionResolutionOptions = {}) {
        this.restitution          = options.restitution          ?? 0.3;
        this.restitutionThreshold = options.restitutionThreshold ?? 1.0;
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

            // Vectors from center of mass to contact point
            const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
            const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
            const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
            const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
            const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
            const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

            // r × n
            const rAxNx = rAy * nz - rAz * ny;
            const rAxNy = rAz * nx - rAx * nz;
            const rAxNz = rAx * ny - rAy * nx;
            const rBxNx = rBy * nz - rBz * ny;
            const rBxNy = rBz * nx - rBx * nz;
            const rBxNz = rBx * ny - rBy * nx;

            // Angular contribution to effective mass: (r×n) · (I⁻¹ * (r×n))
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

            // Relative velocity at contact point (linear + angular contribution)
            const vAxcp = (velA ? (velA[0] ?? 0) : 0) + (omegaA ? ((omegaA[1] ?? 0) * rAz - (omegaA[2] ?? 0) * rAy) : 0);
            const vAycp = (velA ? (velA[1] ?? 0) : 0) + (omegaA ? ((omegaA[2] ?? 0) * rAx - (omegaA[0] ?? 0) * rAz) : 0);
            const vAzcp = (velA ? (velA[2] ?? 0) : 0) + (omegaA ? ((omegaA[0] ?? 0) * rAy - (omegaA[1] ?? 0) * rAx) : 0);
            const vBxcp = (velB ? (velB[0] ?? 0) : 0) + (omegaB ? ((omegaB[1] ?? 0) * rBz - (omegaB[2] ?? 0) * rBy) : 0);
            const vBycp = (velB ? (velB[1] ?? 0) : 0) + (omegaB ? ((omegaB[2] ?? 0) * rBx - (omegaB[0] ?? 0) * rBz) : 0);
            const vBzcp = (velB ? (velB[2] ?? 0) : 0) + (omegaB ? ((omegaB[0] ?? 0) * rBy - (omegaB[1] ?? 0) * rBx) : 0);
            const vRelN = (vAxcp - vBxcp) * nx + (vAycp - vBycp) * ny + (vAzcp - vBzcp) * nz;

            // Per-body restitution (minimum of the two bodies)
            const eA = dynA ? (entryA!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
            const eB = dynB ? (entryB!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
            const e  = Math.min(eA, eB);
            const effectiveE = Math.abs(vRelN) > this.restitutionThreshold ? e : 0;

            const j = -(1.0 + effectiveE) * vRelN / invSum;

            // Depenetration — translational only, always applied when penetrating
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

            // Linear velocity impulse
            if (dynA && velA) {
                const dvA = j * invMA;
                velA[0] = (velA[0] ?? 0) + dvA * nx;
                velA[1] = (velA[1] ?? 0) + dvA * ny;
                velA[2] = (velA[2] ?? 0) + dvA * nz;
            }
            if (dynB && velB) {
                const dvB = j * invMB;
                velB[0] = (velB[0] ?? 0) - dvB * nx;
                velB[1] = (velB[1] ?? 0) - dvB * ny;
                velB[2] = (velB[2] ?? 0) - dvB * nz;
            }

            // Angular velocity impulse: Δω = I⁻¹ × (r × (j·n))
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
        }
    }
}
