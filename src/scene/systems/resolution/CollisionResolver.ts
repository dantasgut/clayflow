import type { PhysicsStageContext } from '../PhysicsStageContext';

/**
 * Interface Strategy para resolução de colisões (GoF — Strategy).
 *
 * Cada implementação encapsula um método de resolução completo:
 * desde o cálculo dos impulsos até a correção de posição.
 *
 * O CollisionResolutionStage delega para a implementação ativa —
 * exatamente como o CollisionDispatcher delega para o CollisionAlgorithm.
 */
export interface CollisionResolver {
    /** Chamado uma vez por frame, antes do loop de substeps. */
    beginFrame?(): void;
    resolve(context: PhysicsStageContext, dt: number): void;
}
