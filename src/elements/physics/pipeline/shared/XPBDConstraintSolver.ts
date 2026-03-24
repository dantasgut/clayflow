import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';

/**
 * Classe base abstrata para estágios de solve de constraints XPBD.
 *
 * Encapsula o loop iterativo do algoritmo XPBD (Müller et al. 2020):
 *   - Inicializa λ acumulado (lambdaAcc) zerado a cada chamada de {@link solve}
 *   - Calcula α̃ = compliance / dt² uma vez por substep
 *   - Itera `iterations` vezes sobre todas as constraints
 *   - Delega a resolução de cada constraint a {@link solveOne} (implementado pela subclasse)
 *   - Oferece o hook {@link onSolveComplete} para que subclasses exportem lambdaAcc
 *
 * Subclasses concretas:
 *   - {@link PBDSolveStage}            — RigidBody: constraint de não-penetração (contato normal)
 *   - {@link DistanceConstraintStage}  — SoftBody: constraint de distância por aresta da malha
 *
 * Contrato das subclasses:
 *   - {@link getConstraints}: retorna a lista de constraints a iterar para o contexto dado
 *   - {@link solveOne}: aplica a correção de posição/rotação diretamente nos corpos
 *   - {@link onSolveComplete} (opcional): sobrescreva para exportar lambdaAcc ao estado externo
 */
export abstract class XPBDConstraintSolver {
    /** Número de iterações do loop Gauss-Seidel por substep. */
    protected readonly iterations: number;
    /**
     * Compliance global da constraint (α na formulação XPBD).
     * Valor 0 = comportamento perfeitamente rígido.
     * Subclasses podem ignorar este valor e usar compliance por constraint em {@link solveOne}.
     */
    protected readonly compliance: number;

    /**
     * @param iterations - Número de iterações do loop Gauss-Seidel por substep.
     * @param compliance - Compliance global (α). Use 0 para constraints rígidas.
     */
    constructor(iterations: number, compliance: number) {
        this.iterations = iterations;
        this.compliance = compliance;
    }

    /**
     * Loop iterativo XPBD. Chamado por `execute()` das subclasses.
     * Inicializa lambdaAcc zerado a cada chamada.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    public solve(context: PhysicsStageContext, dt: number): void {
        const constraints = this.getConstraints(context);
        if (constraints.length === 0) return;

        // λ acumulado por constraint neste substep
        // Inicializado em 0 a cada chamada — PBD usa para accumulated impulse,
        // SoftBody ignora (compliance por constraint calcula αTilde localmente)
        const lambdaAcc = new Float32Array(constraints.length);

        // α̃ = compliance / dt² — normaliza para a escala temporal do substep.
        // Com compliance = 0: α̃ = 0 → comportamento rígido.
        const alphaTilde = dt > 0 && this.compliance > 0 ? this.compliance / (dt * dt) : 0;

        for (let iter = 0; iter < this.iterations; iter++) {
            for (let i = 0; i < constraints.length; i++) {
                this.solveOne(constraints[i]!, i, lambdaAcc, alphaTilde, dt);
            }
        }

        this.onSolveComplete(lambdaAcc);
    }

    /**
     * Retorna a lista de constraints a iterar.
     *
     * Subclasses devem retornar apenas as constraints relevantes ao seu tipo de corpo:
     *   - {@link PBDSolveStage}: retorna `context.contacts` (contatos gerados pelo NarrowphaseStage)
     *   - {@link DistanceConstraintStage}: agrega constraints de aresta de todos os SoftBodies
     *
     * @param context - Contexto do passo de física.
     * @returns       Lista imutável de constraints a processar (pode ser vazia).
     */
    protected abstract getConstraints(context: PhysicsStageContext): readonly unknown[];

    /**
     * Resolve uma única constraint aplicando correção de posição/rotação nos corpos.
     *
     * A subclasse recebe a constraint com o tipo concreto que ela mesma definiu em
     * {@link getConstraints} e deve aplicar diretamente o deslocamento nos corpos.
     *
     * @param constraint  - Constraint a resolver. Tipo concreto definido pela subclasse.
     * @param index       - Índice da constraint no array retornado por {@link getConstraints} —
     *                      usado como chave em `lambdaAcc`.
     * @param lambdaAcc   - Multiplicadores de Lagrange acumulados neste substep
     *                      (leitura e escrita). Índice corresponde ao parâmetro `index`.
     * @param alphaTilde  - Compliance normalizado para a escala temporal: `compliance / dt²`.
     *                      Zero para constraints rígidas.
     * @param dt          - Passo de tempo do substep (segundos).
     */
    protected abstract solveOne(
        constraint: unknown,
        index:      number,
        lambdaAcc:  Float32Array,
        alphaTilde: number,
        dt:         number,
    ): void;

    /**
     * Hook chamado ao final do loop iterativo, após todas as iterações.
     *
     * Implementação padrão é no-op. Subclasses que precisam exportar `lambdaAcc`
     * para estado externo (ex: {@link PBDSolveStage} → {@link PBDState})
     * devem sobrescrever este método.
     *
     * @param _lambdaAcc - Multiplicadores de Lagrange acumulados ao final do solve.
     */
    protected onSolveComplete(_lambdaAcc: Float32Array): void {
        // no-op por padrão
    }
}
