import type { Force } from '../../../scene/systems/forces/Force';
import type { PhysicsBody } from '../../../scene/components/physics/PhysicsBody';
import type { vec3 } from 'gl-matrix';

/**
 * Força definida por função arbitrária — para campos personalizados,
 * geometria diferencial, espaços abstratos.
 */
export class FunctionalForce implements Force {
    public readonly id: string;
    private readonly fn: (body: PhysicsBody, dt: number) => vec3;

    constructor(id: string, fn: (body: PhysicsBody, dt: number) => vec3) {
        this.id = id;
        this.fn = fn;
    }

    public compute(body: PhysicsBody, dt: number): vec3 {
        return this.fn(body, dt);
    }
}
