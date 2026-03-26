import type { BodyStateHandler } from '../BodyStateHandler';
import { PhysicsBodyState }      from '../PhysicsBodyState';

export class KinematicStateHandler implements BodyStateHandler {
    readonly stateId = PhysicsBodyState.Kinematic;

    canApplyForces():           boolean { return false; }
    // Posição controlada externamente — não integrada pelo pipeline
    canIntegrate():             boolean { return false; }
    // Participa como obstáculo estático (aplica impulso em dinâmicos)
    canCollide():               boolean { return true;  }
    // Não recebe impulsos — apenas aplica
    canSolveCollision():        boolean { return false; }
    canSleep():                 boolean { return false; }
    // Transform atualizado externamente
    canSync():                  boolean { return false; }
    // Não entra no shader de integração GPU
    canParticipateInGpuBatch(): boolean { return false; }

    validTransitions(): readonly PhysicsBodyState[] {
        return [PhysicsBodyState.Active, PhysicsBodyState.Inactive, PhysicsBodyState.Removed];
    }
}
