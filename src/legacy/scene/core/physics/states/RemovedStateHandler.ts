import type { BodyStateHandler } from '../BodyStateHandler';
import { PhysicsBodyState }      from '../PhysicsBodyState';

export class RemovedStateHandler implements BodyStateHandler {
    readonly stateId = PhysicsBodyState.Removed;

    canApplyForces():           boolean { return false; }
    canIntegrate():             boolean { return false; }
    canCollide():               boolean { return false; }
    canSolveCollision():        boolean { return false; }
    canSleep():                 boolean { return false; }
    canSync():                  boolean { return false; }
    canParticipateInGpuBatch(): boolean { return false; }

    validTransitions(): readonly PhysicsBodyState[] {
        // Após cleanup no PhysicsWorld volta a Inactive
        return [PhysicsBodyState.Inactive];
    }
}
