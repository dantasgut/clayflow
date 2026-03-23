import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../../../scene/systems/resolution/ResolutionConfig';
import type { PBDState }            from './PBDState';
import type { vec3, quat }          from 'gl-matrix';

/**
 * @deprecated Substituído por `PBDVelocityRecoveryStage` + `PBDContactResponseStage`.
 * Mantido apenas como referência. Use os dois estágios separados no pipeline.
 *
 * Estágio 6 do pipeline PBD — Recuperação de velocidades e restituição.
 *
 * Após o PBDSolveStage ter projetado posições e rotações para satisfazer as
 * constraints, este estágio deriva as velocidades do delta de posição/rotação:
 *
 *   vel   = (pos_new - pos_old) / dt
 *   omega = 2 · Δq.xyz / dt       onde Δq = q_new ⊗ conj(q_old)
 *
 * Estas velocidades "capturadas" refletem tanto a dinâmica livre (predição)
 * quanto as correções impostas pelas constraints — sem necessidade de impulsos
 * de velocidade separados para separação dos corpos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESTITUIÇÃO + CORREÇÃO DE OVER-CORRECTION (bounce / clamp)
 * ─────────────────────────────────────────────────────────────────────────────
 * O PBD puro não produz bounce — corpos colidem e param (coeficiente e = 0).
 * Após recuperar as velocidades, aplica um impulso por contato calculado no
 * PONTO DE CONTATO (não no CM), incluindo contribuição angular (ω × r):
 *
 *   v_contact = v_CM + ω × r
 *   vRelN_pre  = (v_contact_A - v_contact_B) · n   (pré-solve, de velCache)
 *   vRelN_post = idem pós-solve (velocidades já recuperadas pela seção 1)
 *
 *   vn_target = e · |vRelN_pre|   se |vRelN_pre| > threshold, senão 0
 *   wSum      = 1/mA + (rA×n)ᵀ·IA⁻¹·(rA×n) + 1/mB + (rB×n)ᵀ·IB⁻¹·(rB×n)
 *   jN        = (vn_target - vRelN_post) / wSum
 *
 * jN > 0: impulso de separação (restituição)
 * jN < 0: clamp de over-correction — a correção de posição PBD converte
 *         penetração em velocidade de separação; o impulso negativo a freia.
 *
 * O impulso jN é aplicado ao CM linear E ao angular (via r × n), gerando
 * o torque correto do contato — essencial para o bastão tombar ao atingir
 * a borda do plano (sem ele, o bastão gira livremente acumulando penetração).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATRITO (Coulomb)
 * ─────────────────────────────────────────────────────────────────────────────
 * O PBD puro também não produz atrito tangencial — sem restrição de tangente,
 * corpos deslizam livremente ao longo da superfície de contato.
 *
 * Implementação: impulso de velocidade tangencial após a restituição.
 *
 *   jN_equiv = contactLambda[i] / dt   (proxy do impulso normal acumulado)
 *   vRelT    = vRelVec - (vRelVec · n) · n   (componente tangencial)
 *   jT_max   = μ · jN_equiv              (limite de Coulomb)
 *   jT       = min(|vRelT| / invSum, jT_max)  · (-vRelT̂)
 *
 * O sinal negativo em jT opõe o movimento relativo tangencial.
 *
 * Nota: o SleepStage é responsável por desacelerar e adormecer os corpos
 * após o estágio de velocidade — nenhum snap-to-zero aqui.
 */
export class PBDVelocityUpdateStage implements PhysicsStage {
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

        // ── 1. Recupera velocidades do delta de posição/rotação ───────────────
        for (const { body } of context.bodies.values()) {
            if (body.get<boolean>('isKinematic')) continue;

            const uuid   = body.uuid;
            const posOld = this.state.posCache.get(uuid);
            const rotOld = this.state.rotCache.get(uuid);
            if (!posOld && !rotOld) continue;

            const pos = body.get<vec3>('position');
            const rot = body.get<quat>('rotation');

            // ── Damping na velocidade recuperada ─────────────────────────────
            // No pipeline SI, ForceStage aplica damping à velocidade e ela
            // persiste entre substeps. No PBD, VelocityUpdateStage SUBSTITUI
            // a velocidade pelo delta de posição — o damping do ForceStage só
            // afeta a predição, não a velocidade final. Sem damping aqui,
            // linearDamping e angularDamping não têm efeito real no PBD.
            // Nota: o ForceStage já aplica uma vez, então o efeito é ~2× —
            // pequena sobre-dissipação aceitável para manter a estabilidade.
            const linDamp = body.get<number>('linearDamping')  ?? 0;
            const angDamp = body.get<number>('angularDamping') ?? 0;
            const linFactor = linDamp > 0 ? Math.max(0, 1 - linDamp * dt) : 1;
            const angFactor = angDamp > 0 ? Math.max(0, 1 - angDamp * dt) : 1;

            if (pos && posOld) {
                const vel = body.get<vec3>('velocity');
                const vx  = ((pos[0] ?? 0) - posOld[0]) / dt * linFactor;
                const vy  = ((pos[1] ?? 0) - posOld[1]) / dt * linFactor;
                const vz  = ((pos[2] ?? 0) - posOld[2]) / dt * linFactor;
                if (vel) {
                    vel[0] = vx; vel[1] = vy; vel[2] = vz;
                } else {
                    body.set('velocity', new Float32Array([vx, vy, vz]) as unknown as vec3);
                }
            }

            if (rot && rotOld) {
                // Δq = q_new ⊗ conj(q_old)  — conj([x,y,z,w]) = [-x,-y,-z,w]
                const nx_ = rot[0] ?? 0;
                const ny_ = rot[1] ?? 0;
                const nz_ = rot[2] ?? 0;
                const nw  = rot[3] ?? 1;
                const [ox, oy, oz, ow] = rotOld;
                // Produto q_new ⊗ conj(q_old) usando convenção xyzw:
                const dqx =  nw * (-ox!) + nx_ * ow! + ny_ * (-oz!) - nz_ * (-oy!);
                const dqy =  nw * (-oy!) - nx_ * (-oz!) + ny_ * ow! + nz_ * (-ox!);
                const dqz =  nw * (-oz!) + nx_ * (-oy!) - ny_ * (-ox!) + nz_ * ow!;
                const dqw =  nw * ow!    + nx_ * ox!    + ny_ * oy!    + nz_ * oz!;
                // omega = 2 * Δq.xyz / dt  (com sinal de dqw para caminho curto)
                const sign = dqw >= 0 ? 1 : -1;
                const wx   = sign * 2 * dqx / dt * angFactor;
                const wy   = sign * 2 * dqy / dt * angFactor;
                const wz   = sign * 2 * dqz / dt * angFactor;
                const omega = body.get<vec3>('angularVelocity');
                if (omega) {
                    omega[0] = wx; omega[1] = wy; omega[2] = wz;
                } else {
                    body.set('angularVelocity', new Float32Array([wx, wy, wz]) as unknown as vec3);
                }
            }
        }

        // ── 2. Restituição + clamp de over-correction por contato ────────────
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

            // Vetores do CM ao ponto de contato
            const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
            const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
            const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
            const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
            const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
            const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

            // rA × n  e  rB × n  (torque do impulso normal sobre cada corpo)
            const rAxNx = rAy * nz - rAz * ny;
            const rAxNy = rAz * nx - rAx * nz;
            const rAxNz = rAx * ny - rAy * nx;
            const rBxNx = rBy * nz - rBz * ny;
            const rBxNy = rBz * nx - rBx * nz;
            const rBxNz = rBx * ny - rBy * nx;

            // Massa efetiva inclui contribuição angular (igual ao PBDSolveStage)
            const angA_n = IA
                ? rAxNx * rAxNx / Math.max(IA[0]!, 1e-6)
                + rAxNy * rAxNy / Math.max(IA[1]!, 1e-6)
                + rAxNz * rAxNz / Math.max(IA[2]!, 1e-6) : 0;
            const angB_n = IB
                ? rBxNx * rBxNx / Math.max(IB[0]!, 1e-6)
                + rBxNy * rBxNy / Math.max(IB[1]!, 1e-6)
                + rBxNz * rBxNz / Math.max(IB[2]!, 1e-6) : 0;
            const invSum = (dynA ? invMA + angA_n : 0) + (dynB ? invMB + angB_n : 0);
            if (invSum <= 0) continue;

            // Velocidade PRÉ-solve no ponto de contato: v_CM_old + ω × r
            // ω atual ≈ ω pré-solve (PBDSolveStage com scale=0 não modifica omega;
            // seção 1 apenas recupera omega da predição ≈ omega antes da predição)
            const velAOld = dynA ? this.state.velCache.get(entryA!.body.uuid) : null;
            const velBOld = dynB ? this.state.velCache.get(entryB!.body.uuid) : null;
            const vApreX = (velAOld ? velAOld[0] : 0) + (omegaA ? ((omegaA[1] ?? 0) * rAz - (omegaA[2] ?? 0) * rAy) : 0);
            const vApreY = (velAOld ? velAOld[1] : 0) + (omegaA ? ((omegaA[2] ?? 0) * rAx - (omegaA[0] ?? 0) * rAz) : 0);
            const vApreZ = (velAOld ? velAOld[2] : 0) + (omegaA ? ((omegaA[0] ?? 0) * rAy - (omegaA[1] ?? 0) * rAx) : 0);
            const vBpreX = (velBOld ? velBOld[0] : 0) + (omegaB ? ((omegaB[1] ?? 0) * rBz - (omegaB[2] ?? 0) * rBy) : 0);
            const vBpreY = (velBOld ? velBOld[1] : 0) + (omegaB ? ((omegaB[2] ?? 0) * rBx - (omegaB[0] ?? 0) * rBz) : 0);
            const vBpreZ = (velBOld ? velBOld[2] : 0) + (omegaB ? ((omegaB[0] ?? 0) * rBy - (omegaB[1] ?? 0) * rBx) : 0);
            const vRelNPre = (vApreX - vBpreX) * nx + (vApreY - vBpreY) * ny + (vApreZ - vBpreZ) * nz;

            // Apenas processa contatos onde havia aproximação (não separação)
            if (vRelNPre > 0) continue;

            // Velocidade PÓS-solve no ponto de contato (velA/velB já da seção 1)
            const vApostX = (velA ? (velA[0] ?? 0) : 0) + (omegaA ? ((omegaA[1] ?? 0) * rAz - (omegaA[2] ?? 0) * rAy) : 0);
            const vApostY = (velA ? (velA[1] ?? 0) : 0) + (omegaA ? ((omegaA[2] ?? 0) * rAx - (omegaA[0] ?? 0) * rAz) : 0);
            const vApostZ = (velA ? (velA[2] ?? 0) : 0) + (omegaA ? ((omegaA[0] ?? 0) * rAy - (omegaA[1] ?? 0) * rAx) : 0);
            const vBpostX = (velB ? (velB[0] ?? 0) : 0) + (omegaB ? ((omegaB[1] ?? 0) * rBz - (omegaB[2] ?? 0) * rBy) : 0);
            const vBpostY = (velB ? (velB[1] ?? 0) : 0) + (omegaB ? ((omegaB[2] ?? 0) * rBx - (omegaB[0] ?? 0) * rBz) : 0);
            const vBpostZ = (velB ? (velB[2] ?? 0) : 0) + (omegaB ? ((omegaB[0] ?? 0) * rBy - (omegaB[1] ?? 0) * rBx) : 0);
            const vRelNPost = (vApostX - vBpostX) * nx + (vApostY - vBpostY) * ny + (vApostZ - vBpostZ) * nz;

            // Velocidade alvo: bounce se impacto suficiente, senão apenas 0 (parar)
            const e         = this.restitution;
            const vn_target = (e > 0 && vRelNPre < -this.restitutionThreshold)
                ? -e * vRelNPre
                : 0;

            const jN = (vn_target - vRelNPost) / invSum;
            if (Math.abs(jN) < 1e-8) continue;

            if (dynA) {
                if (velA) {
                    velA[0] = (velA[0] ?? 0) + jN * invMA * nx;
                    velA[1] = (velA[1] ?? 0) + jN * invMA * ny;
                    velA[2] = (velA[2] ?? 0) + jN * invMA * nz;
                }
                if (omegaA && IA) {
                    omegaA[0] = (omegaA[0] ?? 0) + jN * rAxNx / Math.max(IA[0]!, 1e-6);
                    omegaA[1] = (omegaA[1] ?? 0) + jN * rAxNy / Math.max(IA[1]!, 1e-6);
                    omegaA[2] = (omegaA[2] ?? 0) + jN * rAxNz / Math.max(IA[2]!, 1e-6);
                }
            }
            if (dynB) {
                if (velB) {
                    velB[0] = (velB[0] ?? 0) - jN * invMB * nx;
                    velB[1] = (velB[1] ?? 0) - jN * invMB * ny;
                    velB[2] = (velB[2] ?? 0) - jN * invMB * nz;
                }
                if (omegaB && IB) {
                    omegaB[0] = (omegaB[0] ?? 0) - jN * rBxNx / Math.max(IB[0]!, 1e-6);
                    omegaB[1] = (omegaB[1] ?? 0) - jN * rBxNy / Math.max(IB[1]!, 1e-6);
                    omegaB[2] = (omegaB[2] ?? 0) - jN * rBxNz / Math.max(IB[2]!, 1e-6);
                }
            }
        }

        // ── 3. Atrito de Coulomb (com torque) ────────────────────────────────
        if (dt <= 0) return;

        for (let i = 0; i < context.contacts.length; i++) {
            const contact = context.contacts[i]!;
            const jN_equiv = (this.state.contactLambda[i] ?? 0) / dt;
            if (jN_equiv <= 0) continue;

            const entryA = context.entityBodies.get(contact.entityIdA);
            const entryB = context.entityBodies.get(contact.entityIdB);
            const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
            const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
            if (!dynA && !dynB) continue;

            // μ combinado: sqrt(μA × μB) — padrão de motores físicos.
            // Corpos sem friction explícito usam 0 (superfície lisa por omissão).
            // Isso evita que a esfera (sem friction) bloqueie o bastão em cunha.
            const muA = entryA ? (entryA.body.get<number>('friction') ?? 0) : 0;
            const muB = entryB ? (entryB.body.get<number>('friction') ?? 0) : 0;
            const mu  = muA > 0 && muB > 0
                ? Math.sqrt(muA * muB)
                : Math.max(muA, muB);   // se um é 0, usa o outro diretamente
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

            // Vetores do CM ao ponto de contato
            const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
            const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
            const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
            const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
            const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
            const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

            // Velocidade relativa no ponto de contato (inclui contribuição angular)
            // vA_contact = velA + omegaA × rA
            const vAcx = (velA ? (velA[0] ?? 0) : 0) + (omegaA ? ((omegaA[1] ?? 0) * rAz - (omegaA[2] ?? 0) * rAy) : 0);
            const vAcy = (velA ? (velA[1] ?? 0) : 0) + (omegaA ? ((omegaA[2] ?? 0) * rAx - (omegaA[0] ?? 0) * rAz) : 0);
            const vAcz = (velA ? (velA[2] ?? 0) : 0) + (omegaA ? ((omegaA[0] ?? 0) * rAy - (omegaA[1] ?? 0) * rAx) : 0);
            const vBcx = (velB ? (velB[0] ?? 0) : 0) + (omegaB ? ((omegaB[1] ?? 0) * rBz - (omegaB[2] ?? 0) * rBy) : 0);
            const vBcy = (velB ? (velB[1] ?? 0) : 0) + (omegaB ? ((omegaB[2] ?? 0) * rBx - (omegaB[0] ?? 0) * rBz) : 0);
            const vBcz = (velB ? (velB[2] ?? 0) : 0) + (omegaB ? ((omegaB[0] ?? 0) * rBy - (omegaB[1] ?? 0) * rBx) : 0);

            const rvx = vAcx - vBcx;
            const rvy = vAcy - vBcy;
            const rvz = vAcz - vBcz;

            // Componente tangencial (remove a parte normal)
            const rvn = rvx * nx + rvy * ny + rvz * nz;
            const tx  = rvx - rvn * nx;
            const ty  = rvy - rvn * ny;
            const tz  = rvz - rvn * nz;
            const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
            if (tLen < 1e-8) continue;

            // Direção tangencial normalizada
            const invLen = 1 / tLen;
            const ttx = tx * invLen;
            const tty = ty * invLen;
            const ttz = tz * invLen;

            const mA    = dynA ? (entryA!.body.get<number>('mass') ?? 1.0) : 0;
            const mB    = dynB ? (entryB!.body.get<number>('mass') ?? 1.0) : 0;
            const invMA = dynA && mA > 0 ? 1 / mA : 0;
            const invMB = dynB && mB > 0 ? 1 / mB : 0;

            // rA × t  e  rB × t  (para massa efetiva rotacional)
            const rAxTx = rAy * ttz - rAz * tty;
            const rAxTy = rAz * ttx - rAx * ttz;
            const rAxTz = rAx * tty - rAy * ttx;
            const rBxTx = rBy * ttz - rBz * tty;
            const rBxTy = rBz * ttx - rBx * ttz;
            const rBxTz = rBx * tty - rBy * ttx;

            const angA = IA
                ? rAxTx * rAxTx / Math.max(IA[0]!, 1e-6)
                + rAxTy * rAxTy / Math.max(IA[1]!, 1e-6)
                + rAxTz * rAxTz / Math.max(IA[2]!, 1e-6) : 0;
            const angB = IB
                ? rBxTx * rBxTx / Math.max(IB[0]!, 1e-6)
                + rBxTy * rBxTy / Math.max(IB[1]!, 1e-6)
                + rBxTz * rBxTz / Math.max(IB[2]!, 1e-6) : 0;

            const wSum = (dynA ? invMA + angA : 0) + (dynB ? invMB + angB : 0);
            if (wSum <= 0) continue;

            // Impulso de atrito limitado por Coulomb
            const jT_max = mu * jN_equiv;
            const jT     = Math.min(tLen / wSum, jT_max);

            // Aplica impulso linear e angular (torque) a ambos os corpos
            if (dynA) {
                if (velA) {
                    velA[0] = (velA[0] ?? 0) - jT * invMA * ttx;
                    velA[1] = (velA[1] ?? 0) - jT * invMA * tty;
                    velA[2] = (velA[2] ?? 0) - jT * invMA * ttz;
                }
                if (omegaA && IA) {
                    // ΔωA = IA⁻¹ · (rA × (-jT·t̂)) = -jT · IA⁻¹ · (rA × t̂)
                    omegaA[0] = (omegaA[0] ?? 0) - jT * rAxTx / Math.max(IA[0]!, 1e-6);
                    omegaA[1] = (omegaA[1] ?? 0) - jT * rAxTy / Math.max(IA[1]!, 1e-6);
                    omegaA[2] = (omegaA[2] ?? 0) - jT * rAxTz / Math.max(IA[2]!, 1e-6);
                }
            }
            if (dynB) {
                if (velB) {
                    velB[0] = (velB[0] ?? 0) + jT * invMB * ttx;
                    velB[1] = (velB[1] ?? 0) + jT * invMB * tty;
                    velB[2] = (velB[2] ?? 0) + jT * invMB * ttz;
                }
                if (omegaB && IB) {
                    // ΔωB = IB⁻¹ · (rB × (jT·t̂)) = +jT · IB⁻¹ · (rB × t̂)
                    omegaB[0] = (omegaB[0] ?? 0) + jT * rBxTx / Math.max(IB[0]!, 1e-6);
                    omegaB[1] = (omegaB[1] ?? 0) + jT * rBxTy / Math.max(IB[1]!, 1e-6);
                    omegaB[2] = (omegaB[2] ?? 0) + jT * rBxTz / Math.max(IB[2]!, 1e-6);
                }
            }
        }
    }
}
