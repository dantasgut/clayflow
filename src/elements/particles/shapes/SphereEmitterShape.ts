import type { EmitterShape, SpawnSample } from '../../../scene/systems/particles/EmitterShape';

/**
 * Emissão na superfície de uma esfera. (Camada 3)
 * Posição e direção uniformes na superfície esférica.
 */
export class SphereEmitterShape implements EmitterShape {
    public readonly id = 'sphere';

    constructor(public radius: number = 0.5) {}

    public sample(): SpawnSample {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.sin(phi) * Math.sin(theta);
        const nz = Math.cos(phi);
        return {
            position:  [nx * this.radius, ny * this.radius, nz * this.radius],
            direction: [nx, ny, nz],
        };
    }
}
