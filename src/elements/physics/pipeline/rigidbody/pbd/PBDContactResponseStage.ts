import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../../../scene/systems/resolution/ResolutionConfig';
import type { PBDState }            from './PBDState';
import type { vec3 }                from 'gl-matrix';
import { ContactImpulseKernel }     from '../../../resolution/ContactImpulseKernel';

/**
 * Estágio 6b do pipeline PBD — Resposta a contatos: restituição + atrito.
 *
 * Executa após `PBDVelocityRecoveryStage`, que já derivou as velocidades
 * do delta de posição/rotação. Este estágio aplica impulsos de velocidade
 * no ponto de contato (v_CM + ω × r), incluindo contribuição angular.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESTITUIÇÃO + CLAMP DE OVER-CORRECTION
 * ─────────────────────────────────────────────────────────────────────────────
 * O PBD puro não produz bounce — corpos colidem e param (coeficiente e = 0).
 * Após a recuperação, aplica um impulso por contato bidirecional:
 *
 *   vRelN_pre  = (v_contact_A − v_contact_B) · n   (pré-solve, de velCache)
 *   vRelN_post = idem pós-solve (após PBDVelocityRecoveryStage)
 *   vn_target  = e · |vRelN_pre|   se |vRelN_pre| > threshold, senão 0
 *   wSum       = 1/mA + (r_A×n)ᵀ · I_A⁻¹ · (r_A×n) + idem B
 *   jN         = (vn_target − vRelN_post) / wSum
 *
 *   jN > 0: impulso de separação (restituição / bounce).
 *   jN < 0: clamp da over-correction — a correção de posição PBD converte
 *           penetração em velocidade de separação artificial; o impulso
 *           negativo a freia sem introduzir penetração.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATRITO DE COULOMB
 * ─────────────────────────────────────────────────────────────────────────────
 * O PBD puro não produz atrito — sem constraint de tangente, corpos deslizam
 * livremente. Impulso tangencial com limite de Coulomb:
 *
 *   jN_equiv = contactLambda[i] / dt   (proxy do impulso normal do PBDSolveStage)
 *   jT_max   = μ · jN_equiv
 *   jT       = min(|vRelT| / wSum_t, jT_max)  na direção −t̂
 *
 * μ combinado: √(μ_A · μ_B) se ambos > 0, max(μ_A, μ_B) caso contrário.
 */
export class PBDContactResponseStage implements PhysicsStage {
    private readonly restitution:          number;
    private readonly restitutionThreshold: number;
    private readonly friction:             number;

    constructor(
        private readonly state: PBDState,
        config: ResolutionConfig = {},
    ) {
        this.restitution          = config.restitution          ?? 0.3;
        this.restitutionThreshold = config.restitutionThreshold ?? 1.0;
        this.friction             = config.friction             ?? 0.5;
    }

    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        this.applyRestitution(context);
        this.applyFriction(context, dt);
    }

    // ── Restituição + clamp de over-correction ────────────────────────────

    private applyRestitution(context: PhysicsStageContext): void {
        for (const contact of context.contacts) {
            const entryA = context.entityBodies.get(contact.entityIdA);
            const entryB = context.entityBodies.get(contact.entityIdB);
            const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
            const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
            if (!dynA && !dynB) continue;

            const { nx, ny, nz, cpx, cpy, cpz } = contact;

            const velA   = dynA ? entryA!.body.get<vec3>('velocity')        : null;
            const velB   = dynB ? entryB!.body.get<vec3>('velocity')        : null;
            const omegaA = dynA ? entryA!.body.get<vec3>('angularVelocity') : null;
            const omegaB = dynB ? entryB!.body.get<vec3>('angularVelocity') : null;
            const posA   = dynA ? entryA!.body.get<vec3>('position')        : null;
            const posB   = dynB ? entryB!.body.get<vec3>('position')        : null;
            const IA     = dynA ? entryA!.body.get<vec3>('inertiaTensor')   : null;
            const IB     = dynB ? entryB!.body.get<vec3>('inertiaTensor')   : null;

            const mA    = dynA ? (entryA!.body.get<number>('mass') ?? 1.0) : 0;
            const mB    = dynB ? (entryB!.body.get<number>('mass') ?? 1.0) : 0;
            const invMA = dynA && mA > 0 ? 1 / mA : 0;
            const invMB = dynB && mB > 0 ? 1 / mB : 0;

            const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
            const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
            const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
            const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
            const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
            const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

            const a = ContactImpulseKernel.axis(
                rAx, rAy, rAz, rBx, rBy, rBz,
                nx, ny, nz,
                invMA, invMB, dynA, dynB, IA, IB,
            );
            if (a.wSum <= 0) continue;

            // Componentes de ω (omega atual ≈ ω pré-solve com scale=0)
            const oAx = omegaA ? (omegaA[0] ?? 0) : 0;
            const oAy = omegaA ? (omegaA[1] ?? 0) : 0;
            const oAz = omegaA ? (omegaA[2] ?? 0) : 0;
            const oBx = omegaB ? (omegaB[0] ?? 0) : 0;
            const oBy = omegaB ? (omegaB[1] ?? 0) : 0;
            const oBz = omegaB ? (omegaB[2] ?? 0) : 0;

            // Velocidade PRÉ-solve no ponto de contato: v_CM_old + ω × r
            // velCache = snapshot da velocidade linear pré-predição
            const velAOld = dynA ? this.state.velCache.get(entryA!.body.uuid) : null;
            const velBOld = dynB ? this.state.velCache.get(entryB!.body.uuid) : null;
            const vApreX = ContactImpulseKernel.vcpX(velAOld ? velAOld[0] : 0, oAy, oAz, rAy, rAz);
            const vApreY = ContactImpulseKernel.vcpY(velAOld ? velAOld[1] : 0, oAx, oAz, rAx, rAz);
            const vApreZ = ContactImpulseKernel.vcpZ(velAOld ? velAOld[2] : 0, oAx, oAy, rAx, rAy);
            const vBpreX = ContactImpulseKernel.vcpX(velBOld ? velBOld[0] : 0, oBy, oBz, rBy, rBz);
            const vBpreY = ContactImpulseKernel.vcpY(velBOld ? velBOld[1] : 0, oBx, oBz, rBx, rBz);
            const vBpreZ = ContactImpulseKernel.vcpZ(velBOld ? velBOld[2] : 0, oBx, oBy, rBx, rBy);
            const vRelNPre = (vApreX - vBpreX) * nx + (vApreY - vBpreY) * ny + (vApreZ - vBpreZ) * nz;

            if (vRelNPre > 0) continue;   // corpos já se separando — sem impulso

            // Velocidade PÓS-solve no ponto de contato (após PBDVelocityRecoveryStage)
            const vApostX = ContactImpulseKernel.vcpX(velA ? (velA[0] ?? 0) : 0, oAy, oAz, rAy, rAz);
            const vApostY = ContactImpulseKernel.vcpY(velA ? (velA[1] ?? 0) : 0, oAx, oAz, rAx, rAz);
            const vApostZ = ContactImpulseKernel.vcpZ(velA ? (velA[2] ?? 0) : 0, oAx, oAy, rAx, rAy);
            const vBpostX = ContactImpulseKernel.vcpX(velB ? (velB[0] ?? 0) : 0, oBy, oBz, rBy, rBz);
            const vBpostY = ContactImpulseKernel.vcpY(velB ? (velB[1] ?? 0) : 0, oBx, oBz, rBx, rBz);
            const vBpostZ = ContactImpulseKernel.vcpZ(velB ? (velB[2] ?? 0) : 0, oBx, oBy, rBx, rBy);
            const vRelNPost = (vApostX - vBpostX) * nx + (vApostY - vBpostY) * ny + (vApostZ - vBpostZ) * nz;

            const e         = this.restitution;
            const vn_target = (e > 0 && vRelNPre < -this.restitutionThreshold)
                ? -e * vRelNPre : 0;

            const jN = (vn_target - vRelNPost) / a.wSum;
            if (Math.abs(jN) < 1e-8) continue;

            if (dynA && velA) ContactImpulseKernel.applyScalar(velA, omegaA, IA, +1, jN, nx, ny, nz, a.rAxDx, a.rAxDy, a.rAxDz, invMA);
            if (dynB && velB) ContactImpulseKernel.applyScalar(velB, omegaB, IB, -1, jN, nx, ny, nz, a.rBxDx, a.rBxDy, a.rBxDz, invMB);
        }
    }

    // ── Atrito de Coulomb ─────────────────────────────────────────────────

    private applyFriction(context: PhysicsStageContext, dt: number): void {
        for (let i = 0; i < context.contacts.length; i++) {
            const contact  = context.contacts[i]!;
            const jN_equiv = (this.state.contactLambda[i] ?? 0) / dt;
            if (jN_equiv <= 0) continue;

            const entryA = context.entityBodies.get(contact.entityIdA);
            const entryB = context.entityBodies.get(contact.entityIdB);
            const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
            const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
            if (!dynA && !dynB) continue;

            // μ combinado: √(μA · μB) se ambos > 0, senão max
            const muA = entryA ? (entryA.body.get<number>('friction') ?? 0) : 0;
            const muB = entryB ? (entryB.body.get<number>('friction') ?? 0) : 0;
            const mu  = ContactImpulseKernel.combineMu(muA, muB);
            if (mu <= 0) continue;

            const velA   = dynA ? entryA!.body.get<vec3>('velocity')        : null;
            const velB   = dynB ? entryB!.body.get<vec3>('velocity')        : null;
            const omegaA = dynA ? entryA!.body.get<vec3>('angularVelocity') : null;
            const omegaB = dynB ? entryB!.body.get<vec3>('angularVelocity') : null;
            const posA   = dynA ? entryA!.body.get<vec3>('position')        : null;
            const posB   = dynB ? entryB!.body.get<vec3>('position')        : null;
            const IA     = dynA ? entryA!.body.get<vec3>('inertiaTensor')   : null;
            const IB     = dynB ? entryB!.body.get<vec3>('inertiaTensor')   : null;

            const { nx, ny, nz, cpx, cpy, cpz } = contact;

            const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
            const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
            const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
            const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
            const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
            const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

            const mA    = dynA ? (entryA!.body.get<number>('mass') ?? 1.0) : 0;
            const mB    = dynB ? (entryB!.body.get<number>('mass') ?? 1.0) : 0;
            const invMA = dynA && mA > 0 ? 1 / mA : 0;
            const invMB = dynB && mB > 0 ? 1 / mB : 0;

            // Velocidade relativa no ponto de contato (v_CM + ω × r)
            const oAx = omegaA ? (omegaA[0] ?? 0) : 0;
            const oAy = omegaA ? (omegaA[1] ?? 0) : 0;
            const oAz = omegaA ? (omegaA[2] ?? 0) : 0;
            const oBx = omegaB ? (omegaB[0] ?? 0) : 0;
            const oBy = omegaB ? (omegaB[1] ?? 0) : 0;
            const oBz = omegaB ? (omegaB[2] ?? 0) : 0;

            const vAcx = ContactImpulseKernel.vcpX(velA ? (velA[0] ?? 0) : 0, oAy, oAz, rAy, rAz);
            const vAcy = ContactImpulseKernel.vcpY(velA ? (velA[1] ?? 0) : 0, oAx, oAz, rAx, rAz);
            const vAcz = ContactImpulseKernel.vcpZ(velA ? (velA[2] ?? 0) : 0, oAx, oAy, rAx, rAy);
            const vBcx = ContactImpulseKernel.vcpX(velB ? (velB[0] ?? 0) : 0, oBy, oBz, rBy, rBz);
            const vBcy = ContactImpulseKernel.vcpY(velB ? (velB[1] ?? 0) : 0, oBx, oBz, rBx, rBz);
            const vBcz = ContactImpulseKernel.vcpZ(velB ? (velB[2] ?? 0) : 0, oBx, oBy, rBx, rBy);

            const rvx = vAcx - vBcx;
            const rvy = vAcy - vBcy;
            const rvz = vAcz - vBcz;

            // Componente tangencial (remove a parte normal)
            const rvn  = rvx * nx + rvy * ny + rvz * nz;
            const tx   = rvx - rvn * nx;
            const ty   = rvy - rvn * ny;
            const tz   = rvz - rvn * nz;
            const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
            if (tLen < 1e-8) continue;

            const invLen = 1 / tLen;
            const ttx = tx * invLen;
            const tty = ty * invLen;
            const ttz = tz * invLen;

            const af = ContactImpulseKernel.axis(
                rAx, rAy, rAz, rBx, rBy, rBz,
                ttx, tty, ttz,
                invMA, invMB, dynA, dynB, IA, IB,
            );
            if (af.wSum <= 0) continue;

            const jT_max = mu * jN_equiv;
            const jT     = Math.min(tLen / af.wSum, jT_max);

            // Atrito opõe o movimento relativo tangencial (−t̂)
            if (dynA && velA) ContactImpulseKernel.applyScalar(velA, omegaA, IA, -1, jT, ttx, tty, ttz, af.rAxDx, af.rAxDy, af.rAxDz, invMA);
            if (dynB && velB) ContactImpulseKernel.applyScalar(velB, omegaB, IB, +1, jT, ttx, tty, ttz, af.rBxDx, af.rBxDy, af.rBxDz, invMB);
        }
    }
}
