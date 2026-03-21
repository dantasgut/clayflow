import type { PhysicsStageContext } from './PhysicsStageContext';

/**
 * Interface de um estágio do pipeline de física (Pipeline pattern).
 *
 * Cada estágio encapsula uma fase única da simulação.
 * O PhysicsWorld orquestra a execução sequencial dos estágios.
 */
export interface PhysicsStage {
    execute(context: PhysicsStageContext, dt: number): void;
}
