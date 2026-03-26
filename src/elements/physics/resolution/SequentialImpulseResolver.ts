import type { CollisionResolver }   from '../../../scene/systems/resolution/CollisionResolver';
import type { PhysicsStageContext } from '../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../scene/systems/resolution/ResolutionConfig';
import type { vec3 }                from 'gl-matrix';
import { ContactImpulseKernel }     from './ContactImpulseKernel';
import type { ContactCache }        from '../contact/ContactCache';
import type { FrictionAnchorCache } from '../contact/FrictionAnchorCache';
import type { BaumgarteCorrector }  from '../contact/BaumgarteCorrector';
import type { ContactKeyBuilder }   from '../contact/ContactKeyBuilder';

/**
 * Dependências externas injetadas no `SequentialImpulseResolver`.
 *
 * Seguindo o princípio de Inversão de Dependências (DIP), o resolver não cria
 * seus próprios caches — recebe os serviços prontos via construtor.
 * Isso permite reusar os mesmos serviços em futuros solvers (LCP, SoftBody) sem duplicação.
 */
export interface SIResolverDeps {
    /** Cache de impulsos acumulados para warm-starting. */
    readonly contactCache:         ContactCache;
    /** Corretor de penetração por Baumgarte posicional. */
    readonly baumgarte:            BaumgarteCorrector;
    /** Gerador de chaves de cache estáveis por ponto de contato. */
    readonly keyBuilder:           ContactKeyBuilder;
    /** Cache de âncoras de atrito (opcional — ativo apenas quando `frictionAnchors: true`). */
    readonly frictionAnchorCache?: FrictionAnchorCache;
}

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
 * ─────────────────────────────────────────────────────────────────────────────
 * WARM STARTING
 * ─────────────────────────────────────────────────────────────────────────────
 * Contatos persistentes (ex: caixa em repouso) têm o mesmo λN a cada frame.
 * Ao reutilizar o λN do frame anterior como ponto de partida, o PGS precisa
 * de muito menos iterações para convergir — geralmente 2 a 3 em vez de 10+.
 *
 * O cache é indexado por par de entidades + posição de contato (grade de 5cm)
 * para sobreviver a pequenas variações de posição entre frames.
 *
 * Warm start é aplicado UMA ÚNICA VEZ por frame (no primeiro substep) usando
 * `beginFrame()` como fronteira — evita que os 8 substeps apliquem o impulso
 * 8× sobre as velocidades.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORREÇÃO DE PENETRAÇÃO
 * ─────────────────────────────────────────────────────────────────────────────
 * Usa correção direta de posição (Baumgarte posicional) aplicada UMA VEZ por
 * substep, após as K iterações de velocidade. Evita injetar energia cinética
 * artificial via bias de velocidade (que cresce com 1/dt em substeps pequenos).
 */
export class SequentialImpulseResolver implements CollisionResolver {
    private readonly restitution:          number;
    private readonly restitutionThreshold: number;
    private readonly friction:             number;
    private readonly iterations:           number;
    private readonly warmStarting:         boolean;
    private readonly overRelaxation:       number;
    private readonly frictionAnchors:      boolean;
    private readonly frictionAnchorBeta:   number;

    /** Controla se o warm start já foi aplicado neste frame. */
    private warmStartApplied = false;

    constructor(
        private readonly deps: SIResolverDeps,
        config: ResolutionConfig = {},
    ) {
        this.restitution          = config.restitution          ?? 0.3;
        this.restitutionThreshold = config.restitutionThreshold ?? 1.0;
        this.friction             = config.friction             ?? 0.5;
        this.iterations           = config.iterations           ?? 10;
        this.warmStarting         = config.warmStarting         ?? true;
        this.overRelaxation       = config.overRelaxation       ?? 1.0;
        this.frictionAnchors      = config.frictionAnchors      ?? false;
        this.frictionAnchorBeta   = config.frictionAnchorBeta   ?? 0.2;
    }

    /**
     * Chamado uma vez por frame (pelo PhysicsWorld antes do loop de substeps).
     * Salva o cache atual como fonte de warm start e reseta o flag de aplicação.
     */
    public beginFrame(): void {
        this.deps.contactCache.beginFrame();
        this.deps.frictionAnchorCache?.beginFrame();
        this.warmStartApplied = false;
    }

    public resolve(context: PhysicsStageContext, dt: number): void {
        const contacts = context.contacts;
        if (contacts.length === 0) return;

        // Impulsos acumulados neste substep [λN, λTx, λTy, λTz], iniciados em 0
        const accumulated: Array<[number, number, number, number]> = contacts.map(() => [0, 0, 0, 0]);

        // Warm start: aplicado UMA VEZ por frame (primeiro substep)
        if (this.warmStarting && !this.warmStartApplied) {
            this.warmStartApplied = true;
            for (let i = 0; i < contacts.length; i++) {
                const c   = contacts[i]!;
                const key = this.deps.keyBuilder.build(c.entityIdA, c.entityIdB, c.cpx, c.cpy, c.cpz, c.featureId);
                const cached = this.deps.contactCache.getPrev(key);
                if (!cached) continue;
                // Fator 0.85: amortece para evitar sobrecorreção quando a geometria mudou
                const λN  = cached[0] * 0.85;
                const λTx = cached[1] * 0.85;
                const λTy = cached[2] * 0.85;
                const λTz = cached[3] * 0.85;
                accumulated[i] = [λN, λTx, λTy, λTz];
                if (λN === 0 && λTx === 0 && λTy === 0 && λTz === 0) continue;
                this.applyWarmStart(c, context, λN, λTx, λTy, λTz);
            }
        }

        // ── K iterações PGS (velocidade) ─────────────────────────────────────
        for (let iter = 0; iter < this.iterations; iter++) {
            for (let i = 0; i < contacts.length; i++) {
                this.resolveContact(contacts[i]!, context, accumulated[i]!, dt);
            }
        }

        // ── Correção de posição (1× por substep, fora das iterações) ─────────
        for (const contact of contacts) {
            this.correctPenetration(contact, context);
        }

        // Salva impulsos acumulados para o próximo frame (warm start)
        for (let i = 0; i < contacts.length; i++) {
            const c   = contacts[i]!;
            const key = this.deps.keyBuilder.build(c.entityIdA, c.entityIdB, c.cpx, c.cpy, c.cpz, c.featureId);
            this.deps.contactCache.set(key, accumulated[i]!);
        }
    }

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
        const dynA    = entryA != null && !entryA.body.get<boolean>('isKinematic') && !entryA.body.get<boolean>('gpuSimulated');
        const dynB    = entryB != null && !entryB.body.get<boolean>('isKinematic') && !entryB.body.get<boolean>('gpuSimulated');
        if (!dynA && !dynB) return;

        const { nx, ny, nz, cpx, cpy, cpz } = contact;

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

        const eA         = dynA ? (entryA!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
        const eB         = dynB ? (entryB!.body.get<number>('restitution') ?? this.restitution) : this.restitution;
        const e          = Math.min(eA, eB);
        const effectiveE = Math.abs(vRelN) > this.restitutionThreshold ? e : 0;

        // ── Impulso normal (PGS + SOR) ───────────────────────────────────────
        const ΔλN      = -(1.0 + effectiveE) * vRelN / a.wSum * weight;
        const λN_old   = accumulated[0];
        const λN_new   = Math.max(λN_old + this.overRelaxation * ΔλN, 0);  // SOR + clamp
        const jN       = λN_new - λN_old;
        accumulated[0] = λN_new;

        if (jN !== 0) {
            if (dynA && entryA!.body.get<boolean>('isSleeping')) entryA!.body.set('isSleeping', false);
            if (dynB && entryB!.body.get<boolean>('isSleeping')) entryB!.body.set('isSleeping', false);
        }

        if (dynA && velA) ContactImpulseKernel.applyScalar(velA, isMultiContact ? null : omegaA, isMultiContact ? null : IA, +1, jN, nx, ny, nz, a.rAxDx, a.rAxDy, a.rAxDz, invMA);
        if (dynB && velB) ContactImpulseKernel.applyScalar(velB, isMultiContact ? null : omegaB, isMultiContact ? null : IB, -1, jN, nx, ny, nz, a.rBxDx, a.rBxDy, a.rBxDz, invMB);

        // ── Atrito de Coulomb (PGS) ──────────────────────────────────────────
        const frX = isMultiContact ? (velA ? (velA[0] ?? 0) : 0) - (velB ? (velB[0] ?? 0) : 0) : vRelX;
        const frY = isMultiContact ? (velA ? (velA[1] ?? 0) : 0) - (velB ? (velB[1] ?? 0) : 0) : vRelY;
        const frZ = isMultiContact ? (velA ? (velA[2] ?? 0) : 0) - (velB ? (velB[2] ?? 0) : 0) : vRelZ;
        const frN = frX * nx + frY * ny + frZ * nz;

        // Friction anchor: adiciona velocidade de restauração à posição original
        let fBiasX = 0, fBiasY = 0, fBiasZ = 0;
        const contactKey = this.deps.keyBuilder.build(contact.entityIdA, contact.entityIdB, cpx, cpy, cpz, contact.featureId);
        if (this.frictionAnchors && dt > 0) {
            const anchor = this.deps.frictionAnchorCache?.getPrev(contactKey);
            if (anchor) {
                const dx = anchor[0] - cpx;
                const dy = anchor[1] - cpy;
                const dz = anchor[2] - cpz;
                // Componente tangencial do deslocamento (remove parte normal)
                const dn = dx * nx + dy * ny + dz * nz;
                const beta = this.frictionAnchorBeta;
                fBiasX = (dx - dn * nx) * beta / dt;
                fBiasY = (dy - dn * ny) * beta / dt;
                fBiasZ = (dz - dn * nz) * beta / dt;
            }
        }

        // Velocidade tangencial efectiva = vRel - velocidade alvo do anchor
        const vRelXt_eff = frX - frN * nx - fBiasX;
        const vRelYt_eff = frY - frN * ny - fBiasY;
        const vRelZt_eff = frZ - frN * nz - fBiasZ;
        const vRelTLen   = Math.sqrt(vRelXt_eff ** 2 + vRelYt_eff ** 2 + vRelZt_eff ** 2);

        if (vRelTLen > 1e-6) {
            const tx = -vRelXt_eff / vRelTLen;
            const ty = -vRelYt_eff / vRelTLen;
            const tz = -vRelZt_eff / vRelTLen;

            const af = ContactImpulseKernel.axis(
                rAx, rAy, rAz, rBx, rBy, rBz,
                tx, ty, tz,
                invMA, invMB, dynA, dynB,
                isMultiContact ? null : IA,
                isMultiContact ? null : IB,
            );
            if (af.wSum > 0) {
                const muA   = entryA ? (entryA.body.get<number>('friction') ?? this.friction) : this.friction;
                const muB   = entryB ? (entryB.body.get<number>('friction') ?? this.friction) : this.friction;
                const mu    = ContactImpulseKernel.combineMu(muA, muB);

                // Cone de Coulomb: |λT| ≤ μ · λN (usa λN acumulado — fisicamente correto)
                const λTMax = mu * λN_new;
                const ΔλT   = vRelTLen / af.wSum;

                const λTx_old = accumulated[1];
                const λTy_old = accumulated[2];
                const λTz_old = accumulated[3];
                // SOR aplicado ao impulso tangencial
                const λTx_new = λTx_old + this.overRelaxation * ΔλT * tx;
                const λTy_new = λTy_old + this.overRelaxation * ΔλT * ty;
                const λTz_new = λTz_old + this.overRelaxation * ΔλT * tz;

                const scale = ContactImpulseKernel.coulombVecScale(λTx_new, λTy_new, λTz_new, λTMax);
                accumulated[1] = λTx_new * scale;
                accumulated[2] = λTy_new * scale;
                accumulated[3] = λTz_new * scale;

                const jTx = accumulated[1] - λTx_old;
                const jTy = accumulated[2] - λTy_old;
                const jTz = accumulated[3] - λTz_old;

                if (dynA && velA) ContactImpulseKernel.applyVec(velA, isMultiContact ? null : omegaA, isMultiContact ? null : IA, +1, jTx, jTy, jTz, rAx, rAy, rAz, invMA);
                if (dynB && velB) ContactImpulseKernel.applyVec(velB, isMultiContact ? null : omegaB, isMultiContact ? null : IB, -1, jTx, jTy, jTz, rBx, rBy, rBz, invMB);

                // Atualiza anchor: mantém se estático (scale < 1 = deslizando → reseta)
                if (this.frictionAnchors) {
                    if (scale < 1.0) {
                        // Deslizando — ancora migra para posição atual
                        this.deps.frictionAnchorCache?.set(contactKey, [cpx, cpy, cpz]);
                    } else {
                        // Estático — preserva ancora anterior ou inicializa
                        const existing = this.deps.frictionAnchorCache?.getPrev(contactKey);
                        this.deps.frictionAnchorCache?.set(contactKey, existing ?? [cpx, cpy, cpz]);
                    }
                }
            }
        } else if (this.frictionAnchors) {
            // Sem velocidade tangencial — inicializa anchor se não existe
            const existing = this.deps.frictionAnchorCache?.getPrev(contactKey);
            this.deps.frictionAnchorCache?.set(contactKey, existing ?? [cpx, cpy, cpz]);
        }
    }

    /**
     * Correção direta de posição — aplicada 1× por substep, fora das iterações
     * de velocidade. Evita a injeção de energia cinética que o bias de velocidade
     * (Baumgarte / dt) causaria ao ser re-aplicado em cada iteração.
     */
    private correctPenetration(
        contact: PhysicsStageContext['contacts'][number],
        context: PhysicsStageContext,
    ): void {
        const entryA = context.entityBodies.get(contact.entityIdA);
        const entryB = context.entityBodies.get(contact.entityIdB);
        const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic') && !entryA.body.get<boolean>('gpuSimulated');
        const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic') && !entryB.body.get<boolean>('gpuSimulated');
        if (!dynA && !dynB) return;

        const { nx, ny, nz, depth } = contact;
        const mA    = dynA ? (entryA!.body.get<number>('mass') ?? 1.0) : 0;
        const mB    = dynB ? (entryB!.body.get<number>('mass') ?? 1.0) : 0;
        const invMA = dynA && mA > 0 ? 1 / mA : 0;
        const invMB = dynB && mB > 0 ? 1 / mB : 0;

        const invSumTrans = invMA + invMB;
        if (invSumTrans <= 0) return;

        const correctionDepth = this.deps.baumgarte.correctionDepth(depth);
        if (correctionDepth <= 0) return;

        const posA = dynA ? entryA!.body.get<vec3>('position') : null;
        const posB = dynB ? entryB!.body.get<vec3>('position') : null;

        if (dynA && posA) {
            const s = this.deps.baumgarte.scaleA(invMA, invSumTrans) * correctionDepth;
            posA[0] = (posA[0] ?? 0) + nx * s;
            posA[1] = (posA[1] ?? 0) + ny * s;
            posA[2] = (posA[2] ?? 0) + nz * s;
        }
        if (dynB && posB) {
            const s = this.deps.baumgarte.scaleB(invMB, invSumTrans) * correctionDepth;
            posB[0] = (posB[0] ?? 0) - nx * s;
            posB[1] = (posB[1] ?? 0) - ny * s;
            posB[2] = (posB[2] ?? 0) - nz * s;
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
        const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic') && !entryA.body.get<boolean>('gpuSimulated');
        const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic') && !entryB.body.get<boolean>('gpuSimulated');
        if (!dynA && !dynB) return;

        const { nx, ny, nz, cpx, cpy, cpz } = contact;
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

        // Impulso combinado: normal (λN·n) + tangente (λT)
        const jNx = λN * nx + λTx;
        const jNy = λN * ny + λTy;
        const jNz = λN * nz + λTz;

        const isMultiContact = contact.weight <= 0.25;
        if (dynA && velA) ContactImpulseKernel.applyVec(velA, isMultiContact ? null : omegaA, isMultiContact ? null : IA, +1, jNx, jNy, jNz, rAx, rAy, rAz, invMA);
        if (dynB && velB) ContactImpulseKernel.applyVec(velB, isMultiContact ? null : omegaB, isMultiContact ? null : IB, -1, jNx, jNy, jNz, rBx, rBy, rBz, invMB);
    }

}
