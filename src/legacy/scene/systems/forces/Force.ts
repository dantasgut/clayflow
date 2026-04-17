import type { PhysicsBody } from '../../components/physics/PhysicsBody';
import type { vec3 } from 'gl-matrix';

/**
 * Interface para forças físicas (Strategy — GoF).
 * Qualquer força — gravitacional, eletromagnética, mola, vento, campo personalizado —
 * é uma função que recebe o estado atual do corpo e retorna um vetor de força.
 *
 * @example
 * // Gravidade padrão
 * world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));
 *
 * // Gravidade radial (espaço curvo)
 * world.addForce(new FunctionalForce('radial', (body) => {
 *     const pos = body.get<vec3>('position') ?? vec3.create();
 *     const dir = vec3.negate(vec3.create(), pos);
 *     return vec3.scale(dir, dir, 9.81 / Math.max(vec3.sqrLen(pos), 0.01));
 * }));
 */
export interface Force {
    readonly id: string;
    compute(body: PhysicsBody, dt: number): vec3;
}
