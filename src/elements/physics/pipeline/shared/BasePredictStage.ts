import type { PhysicsStage }        from '../../../../scene/systems/PhysicsStage';
import type { PhysicsStageContext } from '../../../../scene/systems/PhysicsStageContext';

/**
 * Classe base abstrata para estágios de predição de posição (padrão Template Method).
 *
 * No pipeline XPBD/PBD a predição ocorre ANTES da detecção de colisões:
 * as posições "tentativas" geradas aqui são usadas pelo BroadphaseStage e
 * NarrowphaseStage. O solve de constraints posterior corrige as posições
 * previstas para satisfazer as restrições.
 *
 * Esta classe fornece o método {@link execute} com a assinatura de
 * {@link PhysicsStage} e delega toda a lógica específica a {@link predictBodies},
 * permitindo reutilizar a estrutura do estágio sem duplicação.
 *
 * Subclasses concretas:
 *   - {@link PBDPredictStage}       — RigidBody: salva cache pos/rot/vel no PBDState
 *                                     e integra posição/rotação via Euler explícito
 *   - {@link SoftBodyPredictStage}  — SoftBody: calcula posição prevista (px, py, pz)
 *                                     de cada partícula a partir de (pos + vel · dt)
 *
 * Contrato da subclasse:
 *   - {@link predictBodies}: itera os corpos do contexto e aplica a predição.
 *     Guardas de tipo de corpo (ex: `physicType !== 'SoftBody'`) devem ser feitas aqui.
 */
export abstract class BasePredictStage implements PhysicsStage {
    /**
     * Ponto de entrada do estágio ({@link PhysicsStage}).
     * Delega diretamente para {@link predictBodies}.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    public execute(context: PhysicsStageContext, dt: number): void {
        this.predictBodies(context, dt);
    }

    /**
     * Implementa a lógica de predição específica para o tipo de corpo da subclasse.
     *
     * @param context - Contexto do passo de física com corpos e contatos.
     * @param dt      - Passo de tempo do substep (segundos).
     */
    protected abstract predictBodies(context: PhysicsStageContext, dt: number): void;
}
