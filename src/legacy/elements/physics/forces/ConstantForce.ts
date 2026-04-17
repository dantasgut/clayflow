import type { Force } from '../../../scene/systems/forces/Force';
import type { PhysicsBody } from '../../../scene/components/physics/PhysicsBody';
import { vec3 } from 'gl-matrix';

/**
 * Força constante independente do estado do corpo.
 * Caso de uso principal: gravidade uniforme, vento constante.
 */
export class ConstantForce implements Force {
    public readonly id: string;
    private readonly direction: vec3;

    constructor(id: string, direction: vec3) {
        this.id = id;
        this.direction = vec3.clone(direction);
    }

    public compute(_body: PhysicsBody, _dt: number): vec3 {
        return vec3.clone(this.direction);
    }
}
