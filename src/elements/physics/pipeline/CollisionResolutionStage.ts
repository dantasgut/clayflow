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
 * Estágio 4 do pipeline de física — Resolução de colisões por impulso.
 *
 * Para cada `CollisionContact` gerado pelo NarrowphaseStage, aplica dois impulsos:
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPULSO NORMAL (restituição)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reverte a componente de aproximação da velocidade relativa no ponto de contato.
 *
 *   j = -(1 + e) * vRelN / invSum * weight
 *
 * onde:
 *   vRelN  = velocidade relativa projetada na normal (inclui contribuição angular
 *            ω × r de cada corpo no ponto de contato)
 *   invSum = 1/mA + 1/mB + angA + angB  (massa efetiva na direção normal)
 *   angX   = (rX × n)² / IX  (contribuição da inércia de rotação)
 *   weight = 1/N  (escala o impulso quando há N pontos de contato)
 *   e      = coeficiente de restituição (0 = inelástico, 1 = elástico)
 *            zerado quando |vRelN| < restitutionThreshold (evita micro-vibrações)
 *
 * **Face-contact vs edge/vertex contact (isMultiContact):**
 *   Quando N ≥ 4 pontos formam um contato plano (weight ≤ 0.25), os torques angulares
 *   do impulso normal se cancelam por simetria. Nesse caso, angA e angB são omitidos
 *   de invSum (preservando j maior e o limite de Coulomb correto) e `jAngular = 0`.
 *   Para N < 4 (edge ou vértice), os torques NÃO cancelam — angA/angB são incluídos
 *   e `jAngular = j / weight` (impulso angular completo por contato, sem escala de weight).
 *
 * **Depenetração translacional:**
 *   Corrige posição de forma proporcional às massas inversas, usando somente
 *   invSumTrans = 1/mA + 1/mB (sem inércia angular — correção de posição é linear).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPULSO DE ATRITO (Coulomb)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reduz a velocidade relativa tangencial no ponto de contato.
 *
 *   jT = min(vRelTLen / invSumFr, jTMax)
 *
 * onde:
 *   invSumFr = 1/mA + 1/mB + angFrA + angFrB  (massa efetiva na direção tangencial)
 *   jTMax    = μ * |-(1+e) * vRelN / invSumTrans * weight|
 *
 * O limite de Coulomb (jTMax) usa invSumTrans (massa linear pura) em vez de invSum,
 * porque a lei de Coulomb depende da força normal física no contato — independente
 * de como o impulso se distribui em rotação. Isso garante cap correto tanto para
 * contatos planos (N=4) quanto para edge/vertex (N=1-3).
 *
 * μ é o mínimo entre os coeficientes de atrito dos dois corpos (ou o global do mundo).
 * Corpos cinemáticos têm 1/m = 0 (massa infinita) mas contribuem com seu friction.
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
            const weight  = contact.weight;
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
            // Face-contact simétrico (N = 4 vértices, weight = 1/4 = 0.25): os momentos
            // angulares do impulso normal se cancelam por simetria → usar apenas massa
            // linear em invSum preserva j correto e o limite de Coulomb do atrito.
            // Para vertex (N=1) ou edge contact (N=2, weight=0.5), o torque angular é
            // real e necessário — não suprimir.
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

            // Escala o impulso normal pelo weight do contato (1/N para multi-ponto).
            // Evita sobre-correção quando N contatos cobrem o mesmo par de corpos.
            const j = -(1.0 + effectiveE) * vRelN / invSum * weight;

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
            // Impulso angular do normal:
            // - Face-contact (isMultiContact): omitido — torques cancelam por simetria.
            // - Edge/vertex contact: usa jAngular = j / weight (sem escala de weight).
            //   Motivo: j já foi dividido por N para correção linear (N×j/N = j_total).
            //   O torque angular de cada contato deve ser calculado com o j completo;
            //   a soma dos N torques produz o total correto (ex: N=2, cada torque com
            //   j_full/2, soma = j_full — igual ao contato único equivalente).
            const jAngular = isMultiContact ? 0 : j / weight;
            if (jAngular > 0) {
                if (dynA && omegaA && IA) {
                    const tAx = rAy * (jAngular * nz) - rAz * (jAngular * ny);
                    const tAy = rAz * (jAngular * nx) - rAx * (jAngular * nz);
                    const tAz = rAx * (jAngular * ny) - rAy * (jAngular * nx);
                    omegaA[0] = (omegaA[0] ?? 0) + tAx / Math.max(IA[0]!, 1e-6);
                    omegaA[1] = (omegaA[1] ?? 0) + tAy / Math.max(IA[1]!, 1e-6);
                    omegaA[2] = (omegaA[2] ?? 0) + tAz / Math.max(IA[2]!, 1e-6);
                }
                if (dynB && omegaB && IB) {
                    const tBx = rBy * (jAngular * nz) - rBz * (jAngular * ny);
                    const tBy = rBz * (jAngular * nx) - rBx * (jAngular * nz);
                    const tBz = rBx * (jAngular * ny) - rBy * (jAngular * nx);
                    omegaB[0] = (omegaB[0] ?? 0) - tBx / Math.max(IB[0]!, 1e-6);
                    omegaB[1] = (omegaB[1] ?? 0) - tBy / Math.max(IB[1]!, 1e-6);
                    omegaB[2] = (omegaB[2] ?? 0) - tBz / Math.max(IB[2]!, 1e-6);
                }
            }

            // ── Impulso de atrito (Coulomb) ───────────────────────────────
            // Velocidade relativa tangencial para o atrito.
            // Face-contact (isMultiContact): usa velocidade do CM puro (sem ω×r).
            // ω residual de colisões anteriores cria velocidade tangencial artificial
            // nos cantos; usar contact-point velocity faria o atrito translacional
            // acumular v.x para "compensar" ω, gerando deriva perpétua. Com v_CM,
            // atrito para apenas deslizamento real; ω decai pelo angularDamping.
            // Edge/vertex: mantém contact-point velocity (ω é fisicamente relevante
            // para rolamento e tombamento).
            const frX = isMultiContact ? (velA ? (velA[0] ?? 0) : 0) - (velB ? (velB[0] ?? 0) : 0) : vRelX;
            const frY = isMultiContact ? (velA ? (velA[1] ?? 0) : 0) - (velB ? (velB[1] ?? 0) : 0) : vRelY;
            const frZ = isMultiContact ? (velA ? (velA[2] ?? 0) : 0) - (velB ? (velB[2] ?? 0) : 0) : vRelZ;
            const frN  = frX * nx + frY * ny + frZ * nz;
            const vRelXt = frX - frN * nx;
            const vRelYt = frY - frN * ny;
            const vRelZt = frZ - frN * nz;
            const vRelTLen = Math.sqrt(vRelXt ** 2 + vRelYt ** 2 + vRelZt ** 2);

            if (vRelTLen > 1e-6) {
                // Direção tangencial (oposta ao deslizamento relativo)
                const tx = -vRelXt / vRelTLen;
                const ty = -vRelYt / vRelTLen;
                const tz = -vRelZt / vRelTLen;

                // r × t (contribuição angular na direção tangencial)
                // Face-contact (isMultiContact): os torques de atrito nos N cantos
                // simétricos NÃO cancelam em Z (todos têm rAy igual → torque líquido ≠ 0),
                // gerando ω artificial que induz rolamento-sem-escorregamento → o objeto
                // nunca para. Para face-contact, atrito é puramente translacional —
                // mesmo critério do impulso normal (angFrA/B = 0, sem impulso angular).
                // Para edge/vertex (isMultiContact=false): tratamento angular completo
                // para permitir rolamento físico real (ex: bastão tombando).
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
                    // Impulso necessário para zerar velocidade tangencial, limitado por Coulomb
                    const muA = entryA ? (entryA.body.get<number>('friction') ?? this.friction) : this.friction;
                    const muB = entryB ? (entryB.body.get<number>('friction') ?? this.friction) : this.friction;
                    const mu  = Math.min(muA, muB);
                    // Coulomb: |F_t| ≤ μ|F_n|. F_n é a força física de contato — usa apenas
                    // massa linear (invSumTrans) no denominador, independente da massa angular.
                    // Isso garante cap correto tanto para vertex/edge (N=1-3) como face (N=4).
                    const jTMax = mu * (-(1.0 + effectiveE) * vRelN / invSumTrans * weight);
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
}
