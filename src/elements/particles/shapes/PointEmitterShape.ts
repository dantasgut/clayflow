import type { EmitterShape, SpawnSample } from './EmitterShape';

export class PointEmitterShape implements EmitterShape {
    constructor(
        private readonly position: readonly [number, number, number] = [0, 0, 0],
        private readonly velocity: readonly [number, number, number] = [0, 0, 0],
    ) {}

    sample(_rng: () => number): SpawnSample {
        return { position: this.position, velocity: this.velocity };
    }
}
