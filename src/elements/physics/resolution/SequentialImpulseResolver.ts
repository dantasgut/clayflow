import type { CollisionResolver }   from '../../../scene/systems/resolution/CollisionResolver';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../scene/systems/resolution/ResolutionConfig';
import type { vec3 }                from 'gl-matrix';

/**
 * Resolução por Sequential Impulses (SI) — Projected Gauss-Seidel (PGS).
 *
 * Método popularizado por Erin Catto (Box2D). Em vez de 1 pass por substep,
 * executa K iterações sobre todos os contatos, refinando os impulsos acumulados
 * (λN, λT) a cada passagem até convergir para uma solução consistente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE É MAIS ESTÁVEL QUE O IMPULSE DIRETO
 * ─────────────────────────────────────────────────────────────────────────────
 * No Impulse direto (1 pass), um impulso aplicado ao contato A não influencia
 * o contato B no mesmo substep. Em uma pilha de 3 caixas:
 *   - Base recebe impulso → move-se → mas o topo ainda "não sabe"
 *   - Próximo frame compensa, mas com atraso → tremor ou explosão
 *
 * Com K iterações por substep, o impulso propagado na iteração 1 já está
 * refletido nas velocidades ao processar o contato B na iteração 2.
 * Com 10 iterações, a pilha converge sem tremer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCUMULATED IMPULSES + CLAMPING (núcleo do PGS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Em vez de aplicar Δλ diretamente, mantém o impulso acumulado λN e λT
 * e clampeia após cada incremento:
 *
 *   λN_new = max(λN_old + ΔλN, 0)          (sem impulso de sucção)
 *   |λT_new| ≤ μ * λN_new                   (cone de Coulomb)
 *   impulso_aplicado = λN_new - λN_old
 *
 * Isso garante que o impulso total ao final das K iterações satisfaça
 * as restrições físicas (sem separar o que já foi separado, sem atrito
 * além do normal).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WARM STARTING
 * ─────────────────────────────────────────────────────────────────────────────
 * Contatos persistentes (ex: caixa em repouso) têm o mesmo λN a cada frame.
 * Ao reutilizar o λN do frame anterior como ponto de partida, o PGS precisa
 * de muito menos iterações para convergir — geralmente 2 a 3 em vez de 10+.
 *
 * O cache é indexado por par de entidades + posição de contato (grid de 5cm)
 * para sobreviver a pequenas variações de posição entre frames.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BAUMGARTE NO SI
 * ─────────────────────────────────────────────────────────────────────────────
 * A correção de penetração é incorporada como bias de velocidade em vez de
 * mover posições diretamente:
 *
 *   bias = β * max(depth - slop, 0) / dt
 *
 * O bias é somado ao alvo de velocidade normal:  vRelN + bias ≥ 0
 * Isso mantém a estabilidade numérica do PGS sem a energia espúria do
 * Baumgarte posicional em cada iteração.
 */
export class SequentialImpulseResolver implements CollisionResolver {
    private readonly restitution:          number;
    private readonly restitutionThreshold: number;
    private readonly friction:             number;
    private readonly baumgarteFactor:      number;
    private readonly penetrationSlop:      number;
    private readonly iterations:           number;
    private readonly warmStarting:         boolean;

    /** Cache de impulsos acumulados do frame anterior [λN, λTx, λTy, λTz]. */
    private readonly warmCache = new Map<string, [number, number, number, number]>();

    constructor(config: ResolutionConfig = {}) {
        this.restitution          = config.restitution          ?? 0.3;
        this.restitutionThreshold = config.restitutionThreshold ?? 1.0;
        this.friction             = config.friction             ?? 0.5;
        this.baumgarteFactor      = config.baumgarteFactor      ?? 0.4;
        this.penetrationSlop      = config.penetrationSlop      ?? 0.005;
        this.iterations           = config.iterations           ?? 10;
        this.warmStarting         = config.warmStarting         ?? true;
    }

    public resolve(context: PhysicsStageContext, dt: number): void {
        const contacts = context.contacts;
        if (contacts.length === 0) return;

        // Impulsos acumulados por contato neste substep [λN, λTx, λTy, λTz]
        const accumulated: Array<[number, number, number, number]> = contacts.map((c) => {
            if (!this.warmStarting) return [0, 0, 0, 0];
            const cached = this.warmCache.get(this.contactKey(c));
            // Fator 0.85: amortece o warm start para evitar sobrecorreção quando
            // a geometria de contato mudou levemente (rotação, deslizamento)
            return cached ? [cached[0] * 0.85, cached[1] * 0.85, cached[2] * 0.85, cached[3] * 0.85] : [0, 0, 0, 0];
        });

        // Aplica warm start nas velocidades antes da primeira iteração
        if (this.warmStarting) {
            for (let i = 0; i < contacts.length; i++) {
                const [λN, λTx, λTy, λTz] = accumulated[i]!;
                if (λN === 0 && λTx === 0 && λTy === 0 && λTz === 0) continue;
                this.applyWarmStart(contacts[i]!, context, λN, λTx, λTy, λTz);
            }
        }

        // ── K iterações PGS ──────────────────────────────────────────────────
        for (let iter = 0; iter < this.iterations; iter++) {
            for (let i = 0; i < contacts.length; i++) {
                this.resolveContact(contacts[i]!, context, accumulated[i]!, dt);
            }
        }

        // Atualiza cache para o próximo frame
        this.warmCache.clear();
        for (let i = 0; i < contacts.length; i++) {
            this.warmCache.set(this.contactKey(contacts[i]!), accumulated[i]!);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers internos
    // ──────────────────────────────────────────────────────────────────────────

    private resolveContact(
        contact:     PhysicsStageContext['contacts'][number],
        context:     PhysicsStageContext,
        accumulated: [number, number, number, number],
        dt:          number,
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

        // Velocidade relativa no ponto de contato
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

        const eA         = dynA ? (entryA!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
        const eB         = dynB ? (entryB!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
        const e          = Math.min(eA, eB);
        const effectiveE = Math.abs(vRelN) > this.restitutionThreshold ? e : 0;

        // ── Impulso normal (PGS) ─────────────────────────────────────────────
        // Bias de Baumgarte em velocidade: "quanto de velocidade de separação
        // é necessário para corrigir a penetração neste substep"
        const bias      = dt > 0 ? Math.max(depth - this.penetrationSlop, 0) * this.baumgarteFactor / dt : 0;
        const targetVel = -effectiveE * Math.min(vRelN, 0);   // restituição apenas na aproximação
        const ΔλN       = -(vRelN - targetVel + bias) / invSum * weight;

        const λN_old    = accumulated[0];
        const λN_new    = Math.max(λN_old + ΔλN, 0);   // clamp: sem sucção
        const jN        = λN_new - λN_old;
        accumulated[0]  = λN_new;

        // Acorda corpos antes de aplicar qualquer impulso
        if (jN !== 0) {
            if (dynA && entryA!.body.get<boolean>('isSleeping')) entryA!.body.set('isSleeping', false);
            if (dynB && entryB!.body.get<boolean>('isSleeping')) entryB!.body.set('isSleeping', false);
        }

        if (dynA && velA) {
            velA[0] = (velA[0] ?? 0) + jN * invMA * nx;
            velA[1] = (velA[1] ?? 0) + jN * invMA * ny;
            velA[2] = (velA[2] ?? 0) + jN * invMA * nz;
        }
        if (dynB && velB) {
            velB[0] = (velB[0] ?? 0) - jN * invMB * nx;
            velB[1] = (velB[1] ?? 0) - jN * invMB * ny;
            velB[2] = (velB[2] ?? 0) - jN * invMB * nz;
        }
        const jAngular = isMultiContact ? 0 : jN;
        if (jAngular !== 0) {
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

        // ── Atrito de Coulomb (PGS) ──────────────────────────────────────────
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
                const muA  = entryA ? (entryA.body.get<number>('friction') ?? this.friction) : this.friction;
                const muB  = entryB ? (entryB.body.get<number>('friction') ?? this.friction) : this.friction;
                const mu   = Math.min(muA, muB);

                // Cone de Coulomb: |λT| ≤ μ * λN (usa λN acumulado — fisicamente correto)
                const λTMax = mu * λN_new;
                const ΔλT   = vRelTLen / invSumFr;

                const λTx_old  = accumulated[1];
                const λTy_old  = accumulated[2];
                const λTz_old  = accumulated[3];
                const λTx_new  = λTx_old + ΔλT * tx;
                const λTy_new  = λTy_old + ΔλT * ty;
                const λTz_new  = λTz_old + ΔλT * tz;

                // Clamp do vetor tangencial ao cone
                const λTLen = Math.sqrt(λTx_new ** 2 + λTy_new ** 2 + λTz_new ** 2);
                const scale = λTLen > λTMax && λTLen > 1e-10 ? λTMax / λTLen : 1;
                accumulated[1] = λTx_new * scale;
                accumulated[2] = λTy_new * scale;
                accumulated[3] = λTz_new * scale;

                const jTx = accumulated[1] - λTx_old;
                const jTy = accumulated[2] - λTy_old;
                const jTz = accumulated[3] - λTz_old;

                if (dynA && velA) {
                    velA[0] = (velA[0] ?? 0) + jTx * invMA;
                    velA[1] = (velA[1] ?? 0) + jTy * invMA;
                    velA[2] = (velA[2] ?? 0) + jTz * invMA;
                }
                if (dynB && velB) {
                    velB[0] = (velB[0] ?? 0) - jTx * invMB;
                    velB[1] = (velB[1] ?? 0) - jTy * invMB;
                    velB[2] = (velB[2] ?? 0) - jTz * invMB;
                }
                if (!isMultiContact) {
                    if (dynA && omegaA && IA) {
                        omegaA[0] = (omegaA[0] ?? 0) + (rAy * jTz - rAz * jTy) / Math.max(IA[0]!, 1e-6);
                        omegaA[1] = (omegaA[1] ?? 0) + (rAz * jTx - rAx * jTz) / Math.max(IA[1]!, 1e-6);
                        omegaA[2] = (omegaA[2] ?? 0) + (rAx * jTy - rAy * jTx) / Math.max(IA[2]!, 1e-6);
                    }
                    if (dynB && omegaB && IB) {
                        omegaB[0] = (omegaB[0] ?? 0) - (rBy * jTz - rBz * jTy) / Math.max(IB[0]!, 1e-6);
                        omegaB[1] = (omegaB[1] ?? 0) - (rBz * jTx - rBx * jTz) / Math.max(IB[1]!, 1e-6);
                        omegaB[2] = (omegaB[2] ?? 0) - (rBx * jTy - rBy * jTx) / Math.max(IB[2]!, 1e-6);
                    }
                }
            }
        }
    }

    /** Aplica impulsos do warm start nas velocidades (antes das iterações PGS). */
    private applyWarmStart(
        contact:     PhysicsStageContext['contacts'][number],
        context:     PhysicsStageContext,
        λN:  number, λTx: number, λTy: number, λTz: number,
    ): void {
        const entryA = context.entityBodies.get(contact.entityIdA);
        const entryB = context.entityBodies.get(contact.entityIdB);
        const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
        const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
        if (!dynA && !dynB) return;

        const { nx, ny, nz } = contact;
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

        const { cpx, cpy, cpz } = contact;
        const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
        const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
        const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
        const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
        const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
        const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

        const jNx = λN * nx + λTx;
        const jNy = λN * ny + λTy;
        const jNz = λN * nz + λTz;

        if (dynA && velA) {
            velA[0] = (velA[0] ?? 0) + jNx * invMA;
            velA[1] = (velA[1] ?? 0) + jNy * invMA;
            velA[2] = (velA[2] ?? 0) + jNz * invMA;
        }
        if (dynB && velB) {
            velB[0] = (velB[0] ?? 0) - jNx * invMB;
            velB[1] = (velB[1] ?? 0) - jNy * invMB;
            velB[2] = (velB[2] ?? 0) - jNz * invMB;
        }
        const isMultiContact = contact.weight <= 0.25;
        if (!isMultiContact) {
            if (dynA && omegaA && IA) {
                omegaA[0] = (omegaA[0] ?? 0) + (rAy * jNz - rAz * jNy) / Math.max(IA[0]!, 1e-6);
                omegaA[1] = (omegaA[1] ?? 0) + (rAz * jNx - rAx * jNz) / Math.max(IA[1]!, 1e-6);
                omegaA[2] = (omegaA[2] ?? 0) + (rAx * jNy - rAy * jNx) / Math.max(IA[2]!, 1e-6);
            }
            if (dynB && omegaB && IB) {
                omegaB[0] = (omegaB[0] ?? 0) - (rBy * jNz - rBz * jNy) / Math.max(IB[0]!, 1e-6);
                omegaB[1] = (omegaB[1] ?? 0) - (rBz * jNx - rBx * jNz) / Math.max(IB[1]!, 1e-6);
                omegaB[2] = (omegaB[2] ?? 0) - (rBx * jNy - rBy * jNx) / Math.max(IB[2]!, 1e-6);
            }
        }
    }

    /**
     * Chave de cache para warm starting.
     * Usa grade de 5cm para sobreviver a pequenas variações de posição entre frames.
     */
    private contactKey(c: PhysicsStageContext['contacts'][number]): string {
        return `${c.entityIdA}:${c.entityIdB}:${Math.round(c.cpx * 20)}:${Math.round(c.cpy * 20)}:${Math.round(c.cpz * 20)}`;
    }
}
