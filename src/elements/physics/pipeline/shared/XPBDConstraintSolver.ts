import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';

/**
 * Classe base abstrata para estágios de solve de constraints XPBD.
 *
 * Encapsula o loop iterativo do algoritmo XPBD (Müller et al. 2020):
 *   - Inicializa λ acumulado (lambdaAcc) zerado a cada chamada de solve()
 *   - Calcula α̃ = compliance / dt² uma vez por substep
 *   - Itera `iterations` vezes sobre todas as constraints
 *   - Delega a resolução de cada constraint a solveOne() (implementado pela subclasse)
 *   - Oferece o hook onSolveComplete() para que subclasses exportem lambdaAcc
 *
 * Responsabilidades da subclasse:
 *   - getConstraints(): retorna a lista de constraints a iterar
 *   - solveOne(): aplica a correção de posição/rotação para uma constraint
 *   - onSolveComplete() (opcional): usa lambdaAcc para exportar estado
 */
export abstract class XPBDConstraintSolver {
    protected readonly iterations: number;
    protected readonly compliance: number;

    constructor(iterations: number, compliance: number) {
        this.iterations = iterations;
        this.compliance = compliance;
    }

    /**
     * Loop iterativo XPBD. Chamado por execute() das subclasses.
     * Inicializa lambdaAcc zerado a cada chamada.
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
     * Subclasses retornam context.contacts (PBD) ou constraints do SoftBody.
     */
    protected abstract getConstraints(context: PhysicsStageContext): readonly unknown[];

    /**
     * Resolve uma única constraint.
     * A subclasse aplica a correção de posição/rotação diretamente nos corpos.
     *
     * @param constraint  - constraint a resolver (tipo concreto definido pela subclasse)
     * @param index       - índice da constraint no array (chave de lambdaAcc)
     * @param lambdaAcc   - multiplicadores de Lagrange acumulados (leitura e escrita)
     * @param alphaTilde  - compliance normalizado: compliance / dt²
     * @param dt          - passo de tempo do substep
     */
    protected abstract solveOne(
        constraint: unknown,
        index:      number,
        lambdaAcc:  Float32Array,
        alphaTilde: number,
        dt:         number,
    ): void;

    /**
     * Hook chamado ao final do loop iterativo.
     * Implementação padrão é no-op.
     * Subclasses que precisam exportar lambdaAcc (ex: PBDSolveStage → PBDState)
     * devem sobrescrever este método.
     */
    protected onSolveComplete(_lambdaAcc: Float32Array): void {
        // no-op por padrão
    }
}
