import type { EmitterShape, EmitterShapeGpu, SpawnSample } from './EmitterShape';

export class PointEmitterShape implements EmitterShape {
    constructor(
        private readonly position: readonly [number, number, number] = [0, 0, 0],
        private readonly velocity: readonly [number, number, number] = [0, 0, 0],
    ) {}

    sample(_rng: () => number): SpawnSample {
        return { position: this.position, velocity: this.velocity };
    }

    /** Ponto na GPU: posição e velocidade fixas. */
    gpu(): EmitterShapeGpu {
        return { kind: 0, a: this.position, b: this.velocity, s: [0, 0] };
    }
}
