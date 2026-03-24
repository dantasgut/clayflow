import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';

/**
 * Classe base abstrata para estágios de derivação de velocidade pós-solve (padrão Template Method).
 *
 * No pipeline XPBD/PBD as velocidades são derivadas APÓS o solve de constraints,
 * calculando o deslocamento real ocorrido em vez de integrar forças diretamente.
 * Esta abordagem é fundamental para que as restrições de posição reflitam corretamente
 * nas velocidades (restituição, atrito, sleeping).
 *
 * Esta classe fornece:
 *   - Guarda comum em {@link execute}: `if (dt <= 0) return` — evita divisão por zero
 *   - Utilitário {@link computeDampingFactor} compartilhado entre todas as subclasses
 *   - Template Method: {@link execute} delega a lógica específica a {@link deriveVelocities}
 *
 * Subclasses concretas:
 *   - {@link PBDVelocityRecoveryStage}     — RigidBody: `vel = (pos_new − pos_old) / dt × dampFactor`
 *                                            e `omega = 2 · Δq.xyz / dt × dampFactor`
 *   - {@link SoftBodyVelocityUpdateStage}  — SoftBody: `vel = (p_pred - p_old) / dt × dampFactor`
 *                                            e commita `p_pred` como posição atual
 *
 * Contrato da subclasse:
 *   - {@link deriveVelocities}: itera os corpos, lê posições pré/pós-solve e
 *     escreve as velocidades derivadas. Deve usar {@link computeDampingFactor}
 *     para aplicar amortecimento de forma consistente com o restante do pipeline.
 */
export abstract class BaseVelocityDerivationStage implements PhysicsStage {
    /**
     * Ponto de entrada do estágio ({@link PhysicsStage}).
     * Aplica a guarda `dt <= 0` e delega para {@link deriveVelocities}.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos). Se `<= 0`, não executa.
     */
    public execute(context: PhysicsStageContext, dt: number): void {
        if (dt <= 0) return;
        this.deriveVelocities(context, dt);
    }

    /**
     * Implementa a derivação de velocidade específica para o tipo de corpo da subclasse.
     *
     * Pré-condição: `dt > 0` (garantido pela guarda em {@link execute}).
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos), sempre positivo.
     */
    protected abstract deriveVelocities(context: PhysicsStageContext, dt: number): void;

    /**
     * Calcula o fator de amortecimento multiplicativo para o passo de tempo `dt`.
     *
     * ```
     * factor = max(0, 1 − damping × dt)
     * ```
     *
     * Escalonado por `dt` para que o amortecimento seja independente do número de
     * substeps: `damping = 0.02` resulta em ~2 % de perda por segundo.
     *
     * Compartilhado entre {@link PBDVelocityRecoveryStage} e {@link SoftBodyVelocityUpdateStage}.
     *
     * @param damping - Coeficiente de amortecimento (ex: `linearDamping`, `angularDamping`).
     * @param dt      - Passo de tempo do substep (segundos).
     * @returns         Fator no intervalo `[0, 1]` a multiplicar pela velocidade derivada.
     */
    protected computeDampingFactor(damping: number, dt: number): number {
        return Math.max(0, 1 - damping * dt);
    }
}
