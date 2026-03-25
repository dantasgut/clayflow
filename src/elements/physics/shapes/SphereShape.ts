import { SDFCollider } from './SDFCollider';

/**
 * Forma de colisão esférica. (Camada 3)
 *
 * SDF: |p| - r  (distância ao centro menos o raio)
 * Registra como shape: 'Sphere' — usa SphereSphereTest e BoxSphereTest otimizados
 * quando registrados no CollisionDispatcher.
 */
export class SphereShape extends SDFCollider {
    public readonly radius: number;

    constructor(radius: number = 0.5) {
        super({
            sdf: (p) => Math.sqrt(p[0]! ** 2 + p[1]! ** 2 + p[2]! ** 2) - radius,
            boundingRadius: radius,
            shape: 'Sphere',
        });
        this.radius = radius;
    }

    public override computeInertiaTensor(mass: number): [number, number, number] {
        const I = 0.4 * mass * this.radius ** 2;
        return [I, I, I];
    }
}
