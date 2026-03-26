import type { BodyStateHandler } from '../BodyStateHandler';
import { PhysicsBodyState }      from '../PhysicsBodyState';

export class ActiveStateHandler implements BodyStateHandler {
    readonly stateId = PhysicsBodyState.Active;

    canApplyForces():           boolean { return true; }
    canIntegrate():             boolean { return true; }
    canCollide():               boolean { return true; }
    canSolveCollision():        boolean { return true; }
    canSleep():                 boolean { return true; }
    canSync():                  boolean { return true; }
    canParticipateInGpuBatch(): boolean { return true; }

    validTransitions(): readonly PhysicsBodyState[] {
        return [
            PhysicsBodyState.Sleeping,
            PhysicsBodyState.Kinematic,
            PhysicsBodyState.Removed,
        ];
    }
}
