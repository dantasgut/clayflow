import type { PhysicsBodyState } from './PhysicsBodyState';

/**
 * Handler de estado do ciclo de vida de um PhysicsBody — padrão State (GoF).
 *
 * Cada implementação concreta corresponde a um valor de PhysicsBodyState.
 * Encapsula TODAS as decisões sobre o que o corpo pode fazer em dado estado,
 * eliminando guards dispersos nos stages.
 *
 * Convenção:
 *   can*() → consultado pelos stages (Layer 3 enxerga apenas esta interface)
 *   validTransitions() → usado por PhysicsBody.transitionTo() para validação em DEV
 */
export interface BodyStateHandler {
    /** Valor de enum que este handler representa. */
    readonly stateId: PhysicsBodyState;

    /**
     * Forças e solver devem ser aplicados?
     * true: Active | false: Inactive, Sleeping, Kinematic, Removed
     */
    canApplyForces(): boolean;

    /**
     * Posição e rotação devem ser integradas?
     * true: Active | false: Inactive, Sleeping, Kinematic, Removed
     */
    canIntegrate(): boolean;

    /**
     * Corpo participa da broadphase e narrowphase?
     * true: Active, Sleeping, Kinematic | false: Inactive, Removed
     * Sleeping permanece no broadphase para poder ser acordado por colisão.
     * Kinematic participa como obstáculo estático (aplica impulso em dinâmicos).
     */
    canCollide(): boolean;

    /**
     * Corpo é dinâmico para fins de resolução de colisão?
     * true: Active, Sleeping | false: Inactive, Kinematic, Removed
     * Kinematic colide mas não recebe impulso.
     * Sleeping pode ser acordado pelo solver ao receber impulso.
     */
    canSolveCollision(): boolean;

    /**
     * SleepStage deve avaliar este corpo para adormecer?
     * true: Active | false: Inactive, Sleeping, Kinematic, Removed
     */
    canSleep(): boolean;

    /**
     * SyncStage deve copiar estado físico → Transform visual?
     * true: Active | false: Inactive, Sleeping, Kinematic, Removed
     */
    canSync(): boolean;

    /**
     * Corpo deve ser incluído no batch GPU (GpuRigidBodyPipeline / GpuLcpPipeline)?
     * true: Active, Sleeping | false: Inactive, Kinematic, Removed
     */
    canParticipateInGpuBatch(): boolean;

    /** Estados para os quais esta estado pode transitar. Usado para validação DEV. */
    validTransitions(): readonly PhysicsBodyState[];
}
