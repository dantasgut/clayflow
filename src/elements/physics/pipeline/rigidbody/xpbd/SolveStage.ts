import type { PhysicsStage }        from '../../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../../scene/systems/PhysicsStageContext';
import type { ResolutionConfig }    from '../../../../../scene/systems/resolution/ResolutionConfig';
import type { XPBDState }           from './XPBDState';
import type { vec3, quat }          from 'gl-matrix';
import { ContactImpulseKernel }     from '../../../resolution/ContactImpulseKernel';
import { QuaternionUtils }          from '../../../math/QuaternionUtils';
import { XPBDConstraintSolver }     from '../../shared/XPBDConstraintSolver';

/**
 * Estágio 5 do pipeline XPBD — Projeção de constraints de posição.
 *
 * Implementa XPBD (Extended Position-Based Dynamics, Müller et al. 2020)
 * com compliance α = 0 (rígido). Para cada contato gerado pelo NarrowphaseStage,
 * corrige diretamente posição e rotação dos corpos para satisfazer a restrição
 * de não-penetração.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMULAÇÃO (por contato, por iteração)
 * ─────────────────────────────────────────────────────────────────────────────
 * Restrição de não-penetração: C = depth  (deve ser ≤ 0)
 *
 * Gradientes:
 *   ∇C/∂posA = n       (normal de B para A — direção de separação de A)
 *   ∇C/∂posB = -n
 *   ∇C/∂rotA = rA × n  (torque ao redor do CM de A)
 *   ∇C/∂rotB = -(rB × n)
 *
 * Massas generalizadas:
 *   wA = 1/mA + (rA × n)ᵀ · IA⁻¹ · (rA × n)
 *   wB = 1/mB + (rB × n)ᵀ · IB⁻¹ · (rB × n)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACCUMULATED IMPULSE (evita over-correction de iterações fixas)
 * ─────────────────────────────────────────────────────────────────────────────
 * O contact.depth é fixo — gerado pelo NarrowphaseStage uma vez por substep.
 * Sem acumulação, cada uma das K iterações aplicaria a correção completa,
 * resultando em K× over-correction → velocidades K/dt vezes maiores.
 *
 * Solução: multiplicador de Lagrange acumulado λ_acc por contato por substep.
 *
 *   Δλ = depth/wSum - λ_acc    (residual: quanto ainda falta corrigir)
 *   Se Δλ ≤ 0: contato já convergiu, pula.
 *   λ_acc += Δλ
 *
 * Na 1ª iteração: λ_acc = 0, Δλ = depth/wSum → aplica correção completa.
 * Na 2ª iteração: λ_acc = depth/wSum, Δλ = 0 → sem correção.
 * Para pilhas (contato A afeta posição de B): iterações posteriores ainda
 * detectam resíduo em outros contatos e progridem a convergência.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPLIANCE (XPBD)
 * ─────────────────────────────────────────────────────────────────────────────
 * Com α = 0 (padrão), a constraint é perfeitamente rígida.
 * Para corpos deformáveis, α > 0 amortece a correção:
 *   Δλ = depth/wSum - λ_acc - (α/h²) · λ_acc / wSum   (futura extensão)
 */
export class SolveStage extends XPBDConstraintSolver implements PhysicsStage {
    private readonly slop:                  number;
    private readonly angularCorrectionScale: number;
    // Contexto guardado durante execute() para uso em solveOne()
    private _context: PhysicsStageContext | null = null;

    /**
     * @param state  - Estado compartilhado do pipeline XPBD onde o array `contactLambda`
     *                 será exportado via {@link onSolveComplete} para uso pelo `ContactResponseStage`.
     * @param config - Configuração de resolução de contatos (iterações, compliance, slop, escala angular).
     */
    constructor(
        private readonly state: XPBDState,
        config: ResolutionConfig = {},
    ) {
        super(config.iterations ?? 10, config.compliance ?? 0);
        this.slop       = config.penetrationSlop ?? 0.001;
        // Escala a correção ANGULAR da constraint de posição.
        //
        // Com scale = 1 (padrão XPBD), o contato excêntrico gera um torque
        // restaurador forte: ωz = (rA×n)_z / I_z · Δλ. Para um bastão com
        // contato na base (rA_z ≈ 0.6 m), esse torque equivale a ~3.6 rad/s
        // de correção por substep, muito maior que a aceleração angular da
        // gravidade (~0.009 rad/s/substep). O bastão fica preso vertical.
        //
        // Com scale = 0, a correção de posição é puramente linear (translação).
        // A rotação evolui apenas pelo pipeline de velocidade (gravidade →
        // predição angular, atrito), permitindo que corpos tombem naturalmente.
        //
        // Valores intermediários (0.1–0.3) dão alguma correção angular para
        // estabilidade de contatos face-face, sem dominar o tombamento.
        this.angularCorrectionScale = config.angularCorrectionScale ?? 0;
    }

    /**
     * Ponto de entrada do estágio. Armazena o contexto para acesso em {@link solveOne}
     * e delega ao loop iterativo via {@link XPBDConstraintSolver.solve}.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    public execute(context: PhysicsStageContext, dt: number): void {
        this._context = context;
        this.solve(context, dt);
        this._context = null;
    }

    /**
     * Retorna os contatos gerados pelo NarrowphaseStage para este substep.
     *
     * @param context - Contexto do passo de física.
     * @returns         Lista de contatos a iterar no loop XPBD.
     */
    protected getConstraints(context: PhysicsStageContext): readonly PhysicsStageContext['contacts'][number][] {
        return context.contacts;
    }

    /**
     * Delega a resolução do contato para o método privado `solveContact`.
     *
     * @param constraint  - Contato a resolver (cast para o tipo concreto internamente).
     * @param idx         - Índice do contato — chave em `lambdaAcc`.
     * @param lambdaAcc   - Multiplicadores de Lagrange acumulados neste substep.
     * @param alphaTilde  - Compliance normalizado: `compliance / dt²` (zero = rígido).
     * @param _dt         - Não utilizado diretamente aqui (depth já está em unidades de posição).
     */
    protected solveOne(
        constraint: unknown,
        idx:        number,
        lambdaAcc:  Float32Array,
        alphaTilde: number,
        _dt:        number,
    ): void {
        const context = this._context!;
        const contact = constraint as PhysicsStageContext['contacts'][number];
        this.solveContact(contact, context, lambdaAcc, idx, alphaTilde);
    }

    /**
     * Exporta o array de multiplicadores de Lagrange acumulados para {@link XPBDState.contactLambda}.
     * O `ContactResponseStage` usa esses valores como proxy do impulso normal
     * para calcular o limite de Coulomb do atrito.
     *
     * @param lambdaAcc - Multiplicadores de Lagrange acumulados ao final do solve.
     */
    protected override onSolveComplete(lambdaAcc: Float32Array): void {
        // Exporta λ acumulado para o ContactResponseStage usar como proxy
        // do impulso normal — base para o limite de Coulomb do atrito.
        this.state.contactLambda = Array.from(lambdaAcc);
    }

    // ──────────────────────────────────────────────────────────────────────────

    private solveContact(
        contact: PhysicsStageContext['contacts'][number],
        context: PhysicsStageContext,
        λAcc:    Float32Array,
        idx:     number,
        αTilde:  number,
    ): void {
        const entryA = context.entityBodies.get(contact.entityIdA);
        const entryB = context.entityBodies.get(contact.entityIdB);
        const dynA   = entryA != null && !entryA.body.get<boolean>('isKinematic');
        const dynB   = entryB != null && !entryB.body.get<boolean>('isKinematic');
        if (!dynA && !dynB) return;

        // contact.depth = manifold.depth / N (NarrowphaseStage já dividiu por N).
        // Slop também dividido por N para manter a zona morta equivalente a 1 slop
        // no nível do manifold (sem escalar, a zona morta efetiva seria N × slop,
        // descartando contatos legítimos em face-contact com 4 pontos).
        const depth = contact.depth - this.slop * contact.weight;
        if (depth <= 0) return;

        const { nx, ny, nz, cpx, cpy, cpz } = contact;

        // Acorda corpos adormecidos atingidos pela constraint
        if (dynA && entryA!.body.get<boolean>('isSleeping')) entryA!.body.set('isSleeping', false);
        if (dynB && entryB!.body.get<boolean>('isSleeping')) entryB!.body.set('isSleeping', false);

        const mA    = dynA ? (entryA!.body.get<number>('mass') ?? 1.0) : 0;
        const mB    = dynB ? (entryB!.body.get<number>('mass') ?? 1.0) : 0;
        const invMA = dynA && mA > 0 ? 1 / mA : 0;
        const invMB = dynB && mB > 0 ? 1 / mB : 0;

        const posA = dynA ? entryA!.body.get<vec3>('position') : null;
        const posB = dynB ? entryB!.body.get<vec3>('position') : null;
        const rotA = dynA ? entryA!.body.get<quat>('rotation') : null;
        const rotB = dynB ? entryB!.body.get<quat>('rotation') : null;
        const IA   = dynA ? entryA!.body.get<vec3>('inertiaTensor') : null;
        const IB   = dynB ? entryB!.body.get<vec3>('inertiaTensor') : null;

        // Vetores do CM ao ponto de contato (relidos por iteração — posições já corrigidas)
        const rAx = cpx - (posA ? (posA[0] ?? 0) : 0);
        const rAy = cpy - (posA ? (posA[1] ?? 0) : 0);
        const rAz = cpz - (posA ? (posA[2] ?? 0) : 0);
        const rBx = cpx - (posB ? (posB[0] ?? 0) : 0);
        const rBy = cpy - (posB ? (posB[1] ?? 0) : 0);
        const rBz = cpz - (posB ? (posB[2] ?? 0) : 0);

        // Massas generalizadas — componente angular só entra quando será aplicada.
        // Se angularCorrectionScale = 0, passe null para IA/IB: Δλ = depth/invM
        // satisfaz a penetração inteiramente via translação, sem acumulação progressiva.
        const useAngular = this.angularCorrectionScale > 0;
        const a = ContactImpulseKernel.axis(
            rAx, rAy, rAz, rBx, rBy, rBz,
            nx, ny, nz,
            invMA, invMB, dynA, dynB,
            useAngular ? IA : null,
            useAngular ? IB : null,
        );
        if (a.wSum <= 0) return;

        // ── Accumulated impulse (XPBD) ────────────────────────────────────────
        // Target: λ_target = depth / (wSum + α̃)
        //   α̃ = 0 → λ_target = depth/wSum  (rígido, igual ao anterior).
        //   α̃ > 0 → denominador maior → λ_target menor → Δpos por substep menor.
        //
        // Accumulated impulse: Δλ = λ_target - λ_acc
        //   Converge em 1 iteração por contato isolado; múltiplas iterações
        //   propagam correções entre contatos que compartilham corpos (pilhas).
        const Δλ = depth / (a.wSum + αTilde) - (λAcc[idx] ?? 0);
        if (Δλ <= 1e-10) return;   // já convergiu para este contato
        λAcc[idx] = (λAcc[idx] ?? 0) + Δλ;

        // ── Correção de posição ───────────────────────────────────────────────
        if (dynA && posA) {
            const s = invMA * Δλ;
            posA[0] = (posA[0] ?? 0) + nx * s;
            posA[1] = (posA[1] ?? 0) + ny * s;
            posA[2] = (posA[2] ?? 0) + nz * s;
        }
        if (dynB && posB) {
            const s = invMB * Δλ;
            posB[0] = (posB[0] ?? 0) - nx * s;
            posB[1] = (posB[1] ?? 0) - ny * s;
            posB[2] = (posB[2] ?? 0) - nz * s;
        }

        // ── Correção de rotação via derivada de quaternion ────────────────────
        // Escalonada por angularCorrectionScale (0 = sem correção angular,
        // corpos tombam livremente; 1 = XPBD padrão, torque restaurador forte).
        if (this.angularCorrectionScale > 0) {
            const scΔλ = Δλ * this.angularCorrectionScale;
            if (dynA && rotA && IA) {
                QuaternionUtils.applyAngularDelta(rotA,
                    a.rAxDx / Math.max(IA[0]!, 1e-6) * scΔλ,
                    a.rAxDy / Math.max(IA[1]!, 1e-6) * scΔλ,
                    a.rAxDz / Math.max(IA[2]!, 1e-6) * scΔλ,
                );
            }
            if (dynB && rotB && IB) {
                QuaternionUtils.applyAngularDelta(rotB,
                    -a.rBxDx / Math.max(IB[0]!, 1e-6) * scΔλ,
                    -a.rBxDy / Math.max(IB[1]!, 1e-6) * scΔλ,
                    -a.rBxDz / Math.max(IB[2]!, 1e-6) * scΔλ,
                );
            }
        }
    }
}
