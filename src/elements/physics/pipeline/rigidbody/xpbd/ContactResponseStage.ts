import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../../../scene/systems/resolution/ResolutionConfig';
import type { XPBDState }           from './XPBDState';
import type { vec3 }                from 'gl-matrix';
import { ContactImpulseKernel }     from '../../../resolution/ContactImpulseKernel';

/**
 * Estágio 6b do pipeline XPBD — Resposta a contatos: restituição + atrito.
 *
 * Executa após `VelocityRecoveryStage`, que já derivou as velocidades
 * do delta de posição/rotação. Itera uma única vez sobre os contatos e,
 * para cada um, aplica restituição e atrito de Coulomb usando as propriedades
 * de corpo extraídas uma única vez por contato.
 *
 *   vRelN_pre  = (v_contact_A − v_contact_B) · n   (pré-solve, de velCache)
 *   jN         = (e·|vRelN_pre| − vRelN_post) / wSum
 *
 *   jN_equiv   = contactLambda[i] / dt             (proxy do impulso normal)
 *   jT         = clamp(|vRelT| / wSum_t, μ · jN_equiv)
 */
export class ContactResponseStage implements PhysicsStage {
    private readonly restitution:          number;
    private readonly restitutionThreshold: number;
    private readonly friction:             number;

    constructor(
        private readonly state: XPBDState,
        config: ResolutionConfig = {},
    ) {
        this.restitution          = config.restitution          ?? 0.3;
        this.restitutionThreshold = config.restitutionThreshold ?? 1.0;
        this.friction             = config.friction             ?? 0.5;
    }

    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        for (let i = 0; i < context.contacts.length; i++) {
            this.resolveContact(context.contacts[i]!, context, i, dt);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────

    private resolveContact(
        contact: PhysicsStageContext['contacts'][number],
        context: PhysicsStageContext,
        idx:     number,
        dt:      number,
    ): void {
        const entryA = context.entityBodies.get(contact.entityIdA);
        const entryB = context.entityBodies.get(contact.entityIdB);
        const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
        const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
        if (!dynA && !dynB) return;

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

        const oAx = omegaA ? (omegaA[0] ?? 0) : 0;
        const oAy = omegaA ? (omegaA[1] ?? 0) : 0;
        const oAz = omegaA ? (omegaA[2] ?? 0) : 0;
        const oBx = omegaB ? (omegaB[0] ?? 0) : 0;
        const oBy = omegaB ? (omegaB[1] ?? 0) : 0;
        const oBz = omegaB ? (omegaB[2] ?? 0) : 0;

        const a = ContactImpulseKernel.axis(
            rAx, rAy, rAz, rBx, rBy, rBz,
            nx, ny, nz,
            invMA, invMB, dynA, dynB, IA, IB,
        );
        if (a.wSum <= 0) return;

        // ── Restituição + clamp de over-correction ────────────────────────────
        const velAOld  = dynA ? this.state.velCache.get(entryA!.body.uuid) : null;
        const velBOld  = dynB ? this.state.velCache.get(entryB!.body.uuid) : null;
        const vApreX   = ContactImpulseKernel.vcpX(velAOld ? velAOld[0] : 0, oAy, oAz, rAy, rAz);
        const vApreY   = ContactImpulseKernel.vcpY(velAOld ? velAOld[1] : 0, oAx, oAz, rAx, rAz);
        const vApreZ   = ContactImpulseKernel.vcpZ(velAOld ? velAOld[2] : 0, oAx, oAy, rAx, rAy);
        const vBpreX   = ContactImpulseKernel.vcpX(velBOld ? velBOld[0] : 0, oBy, oBz, rBy, rBz);
        const vBpreY   = ContactImpulseKernel.vcpY(velBOld ? velBOld[1] : 0, oBx, oBz, rBx, rBz);
        const vBpreZ   = ContactImpulseKernel.vcpZ(velBOld ? velBOld[2] : 0, oBx, oBy, rBx, rBy);
        const vRelNPre = (vApreX - vBpreX) * nx + (vApreY - vBpreY) * ny + (vApreZ - vBpreZ) * nz;

        if (vRelNPre <= 0) {
            const vApostX   = ContactImpulseKernel.vcpX(velA ? (velA[0] ?? 0) : 0, oAy, oAz, rAy, rAz);
            const vApostY   = ContactImpulseKernel.vcpY(velA ? (velA[1] ?? 0) : 0, oAx, oAz, rAx, rAz);
            const vApostZ   = ContactImpulseKernel.vcpZ(velA ? (velA[2] ?? 0) : 0, oAx, oAy, rAx, rAy);
            const vBpostX   = ContactImpulseKernel.vcpX(velB ? (velB[0] ?? 0) : 0, oBy, oBz, rBy, rBz);
            const vBpostY   = ContactImpulseKernel.vcpY(velB ? (velB[1] ?? 0) : 0, oBx, oBz, rBx, rBz);
            const vBpostZ   = ContactImpulseKernel.vcpZ(velB ? (velB[2] ?? 0) : 0, oBx, oBy, rBx, rBy);
            const vRelNPost = (vApostX - vBpostX) * nx + (vApostY - vBpostY) * ny + (vApostZ - vBpostZ) * nz;

            const e         = this.restitution;
            const vn_target = (e > 0 && vRelNPre < -this.restitutionThreshold) ? -e * vRelNPre : 0;
            const jN        = (vn_target - vRelNPost) / a.wSum;

            if (Math.abs(jN) >= 1e-8) {
                if (dynA && velA) ContactImpulseKernel.applyScalar(velA, omegaA, IA, +1, jN, nx, ny, nz, a.rAxDx, a.rAxDy, a.rAxDz, invMA);
                if (dynB && velB) ContactImpulseKernel.applyScalar(velB, omegaB, IB, -1, jN, nx, ny, nz, a.rBxDx, a.rBxDy, a.rBxDz, invMB);
            }
        }

        // ── Atrito de Coulomb ─────────────────────────────────────────────────
        const jN_equiv = (this.state.contactLambda[idx] ?? 0) / dt;
        if (jN_equiv <= 0) return;

        const muA = entryA ? (entryA.body.get<number>('friction') ?? 0) : 0;
        const muB = entryB ? (entryB.body.get<number>('friction') ?? 0) : 0;
        const mu  = ContactImpulseKernel.combineMu(muA, muB);
        if (mu <= 0) return;

        // Velocidade relativa no ponto de contato — lida após a restituição
        const rvx = ContactImpulseKernel.vcpX(velA ? (velA[0] ?? 0) : 0, oAy, oAz, rAy, rAz) - ContactImpulseKernel.vcpX(velB ? (velB[0] ?? 0) : 0, oBy, oBz, rBy, rBz);
        const rvy = ContactImpulseKernel.vcpY(velA ? (velA[1] ?? 0) : 0, oAx, oAz, rAx, rAz) - ContactImpulseKernel.vcpY(velB ? (velB[1] ?? 0) : 0, oBx, oBz, rBx, rBz);
        const rvz = ContactImpulseKernel.vcpZ(velA ? (velA[2] ?? 0) : 0, oAx, oAy, rAx, rAy) - ContactImpulseKernel.vcpZ(velB ? (velB[2] ?? 0) : 0, oBx, oBy, rBx, rBy);

        ContactImpulseKernel.applyFriction(
            velA, omegaA, IA, velB, omegaB, IB,
            rAx, rAy, rAz, rBx, rBy, rBz,
            invMA, invMB, dynA, dynB,
            rvx, rvy, rvz, nx, ny, nz,
            jN_equiv, mu,
        );
    }
}
