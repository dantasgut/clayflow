import { PhysicsBodyState }        from './PhysicsBodyState';
import type { BodyStateHandler }   from './BodyStateHandler';
import { InactiveStateHandler }    from './states/InactiveStateHandler';
import { ActiveStateHandler }      from './states/ActiveStateHandler';
import { SleepingStateHandler }    from './states/SleepingStateHandler';
import { KinematicStateHandler }   from './states/KinematicStateHandler';
import { RemovedStateHandler }     from './states/RemovedStateHandler';

/**
 * Registry flyweight de BodyStateHandler.
 * Um único handler imutável por estado — sem alocação por corpo.
 */
const HANDLERS: Record<PhysicsBodyState, BodyStateHandler> = {
    [PhysicsBodyState.Inactive]:  new InactiveStateHandler(),
    [PhysicsBodyState.Active]:    new ActiveStateHandler(),
    [PhysicsBodyState.Sleeping]:  new SleepingStateHandler(),
    [PhysicsBodyState.Kinematic]: new KinematicStateHandler(),
    [PhysicsBodyState.Removed]:   new RemovedStateHandler(),
};

export const BodyStateHandlerRegistry = {
    get(state: PhysicsBodyState): BodyStateHandler {
        return HANDLERS[state]!;
    },
} as const;
