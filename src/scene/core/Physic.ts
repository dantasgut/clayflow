import { ResourceType } from './ResourceType';

export interface Physic {
    readonly layer: ResourceType.PHYSICS_MECHANIC;
    readonly physicType: string;
}
