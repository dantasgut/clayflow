import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';
import type { SoftBody }            from '../../SoftBody';
import { XPBDConstraintSolver }     from '../shared/XPBDConstraintSolver';

/**
 * Estágio 3 do pipeline XPBD SoftBody — Solve de constraints de distância.
 *
 * Especialização de {@link XPBDConstraintSolver} para corpos moles (SoftBody).
 * Para cada constraint de aresta da malha, corrige as posições previstas
 * `(px, py, pz)` das duas partículas para satisfazer `|pj − pi| = restLength`.
 *
 * Formulação XPBD (Müller et al. 2020) por aresta, por iteração:
 * ```
 * C  = |Δp| − restLength       (violação da constraint)
 * α̃  = compliance / dt²         (compliance normalizado para o substep)
 * Δλ = −C / (wi + wj + α̃)      (correção do multiplicador de Lagrange)
 * pi += +wi · Δλ · n̂            (corrige partícula i em direção à separação)
 * pj += −wj · Δλ · n̂            (corrige partícula j em sentido oposto)
 * ```
 *
 * Múltiplas iterações convergem constraints interdependentes em malhas densas.
 *
 * Nota: cada aresta usa seu próprio `compliance` — o `compliance` global herdado
 * de {@link XPBDConstraintSolver} é zerado no construtor. O `alphaTilde` passado
 * pelo loop base é ignorado em {@link solveOne}; cada entry calcula localmente.
 */

/** Constraint enriquecida com dados do SoftBody necessários em {@link DistanceConstraintStage.solveOne}. */
interface SolveEntry {
    readonly pA:         SoftBody['particles'][number];
    readonly pB:         SoftBody['particles'][number];
    readonly restLength: number;
    readonly compliance: number;
    readonly pInvMass:   number;
}

export class DistanceConstraintStage extends XPBDConstraintSolver implements PhysicsStage {
    /**
     * @param iterations - Número de iterações Gauss-Seidel por substep (padrão: 10).
     *                     Valores maiores aumentam a rigidez percebida em malhas densas.
     */
    constructor(iterations = 10) {
        // compliance = 0 na base: cada constraint usa seu próprio c.compliance via solveOne()
        super(iterations, 0);
    }

    /**
     * Ponto de entrada do estágio. Aplica guarda `dt <= 0` e delega ao loop base
     * via {@link XPBDConstraintSolver.solve}.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        this.solve(context, dt);
    }

    /**
     * Agrega todas as constraints de aresta de todos os SoftBodies do contexto.
     * Corpos de outros tipos físicos são ignorados.
     * O `invMass` por partícula é derivado da propriedade `mass` do corpo no momento da chamada.
     *
     * @param context - Contexto do passo de física.
     * @returns         Lista de {@link SolveEntry} prontas para iterar em {@link solveOne}.
     */
    protected getConstraints(context: PhysicsStageContext): readonly SolveEntry[] {
        const entries: SolveEntry[] = [];

        for (const { body } of context.bodies.values()) {
            if (body.physicType !== 'SoftBody') continue;
            const sb = body as unknown as SoftBody;
            if (sb.particles.length === 0 || sb.constraints.length === 0) continue;

            // invMass real derivado do property bag — efetivo a qualquer momento
            const mass     = body.get<number>('mass') ?? 1.0;
            const pInvMass = sb.particles.length / mass;

            for (const c of sb.constraints) {
                const pA = sb.particles[c.i];
                const pB = sb.particles[c.j];
                if (!pA || !pB) continue;
                entries.push({
                    pA,
                    pB,
                    restLength: c.restLength,
                    compliance: c.compliance,
                    pInvMass,
                });
            }
        }

        return entries;
    }

    /**
     * Resolve uma constraint de distância entre duas partículas.
     *
     * O `alphaTilde` do loop base é ignorado — cada entry usa seu próprio `compliance`
     * para calcular `αTilde = compliance / dt²` localmente, permitindo rigidez
     * heterogênea na mesma malha.
     *
     * @param constraint  - {@link SolveEntry} com as duas partículas e metadados da aresta.
     * @param _index      - Não utilizado (lambdaAcc não é acumulado neste estágio).
     * @param _lambdaAcc  - Não utilizado (compliance por constraint ignora acumulação global).
     * @param _alphaTilde - Não utilizado (ver nota acima).
     * @param dt          - Passo de tempo do substep (segundos).
     */
    protected solveOne(
        constraint: unknown,
        _index:     number,
        _lambdaAcc: Float32Array,
        _alphaTilde: number,
        dt:         number,
    ): void {
        const { pA, pB, restLength, compliance, pInvMass } = constraint as SolveEntry;

        const wA = pA.w === 0 ? 0 : pInvMass;
        const wB = pB.w === 0 ? 0 : pInvMass;

        const dx = pB.px - pA.px;
        const dy = pB.py - pA.py;
        const dz = pB.pz - pA.pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-8) return;

        const C      = dist - restLength;
        const αTilde = compliance / (dt * dt);
        const wSum   = wA + wB + αTilde;
        if (wSum < 1e-12) return;

        const Δλ = -C / wSum;
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        pA.px -= wA * Δλ * nx;
        pA.py -= wA * Δλ * ny;
        pA.pz -= wA * Δλ * nz;

        pB.px += wB * Δλ * nx;
        pB.py += wB * Δλ * ny;
        pB.pz += wB * Δλ * nz;
    }
}
