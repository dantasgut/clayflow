import type { BodyStateHandler } from '../BodyStateHandler';
import { PhysicsBodyState }      from '../PhysicsBodyState';

export class SleepingStateHandler implements BodyStateHandler {
    readonly stateId = PhysicsBodyState.Sleeping;

    canApplyForces():           boolean { return false; }
    canIntegrate():             boolean { return false; }
    // Permanece no broadphase/narrowphase para poder ser acordado por colisão
    canCollide():               boolean { return true;  }
    canSolveCollision():        boolean { return true;  }
    canSleep():                 boolean { return false; }
    // Posição estável — nenhuma mudança a sincronizar
    canSync():                  boolean { return false; }
    // Shader GPU lida com sleep internamente via sleep_lin_threshold
    canParticipateInGpuBatch(): boolean { return true;  }

    validTransitions(): readonly PhysicsBodyState[] {
        return [PhysicsBodyState.Active, PhysicsBodyState.Removed];
    }
}
