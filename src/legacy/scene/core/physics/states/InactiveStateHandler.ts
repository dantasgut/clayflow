import type { BodyStateHandler } from '../BodyStateHandler';
import { PhysicsBodyState }      from '../PhysicsBodyState';

export class InactiveStateHandler implements BodyStateHandler {
    readonly stateId = PhysicsBodyState.Inactive;

    canApplyForces():           boolean { return false; }
    canIntegrate():             boolean { return false; }
    canCollide():               boolean { return false; }
    canSolveCollision():        boolean { return false; }
    canSleep():                 boolean { return false; }
    canSync():                  boolean { return false; }
    canParticipateInGpuBatch(): boolean { return false; }

    validTransitions(): readonly PhysicsBodyState[] {
        return [PhysicsBodyState.Active, PhysicsBodyState.Kinematic];
    }
}
