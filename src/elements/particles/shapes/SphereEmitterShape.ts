import type { EmitterShape, SpawnSample } from './EmitterShape';

export class SphereEmitterShape implements EmitterShape {
    constructor(
        private readonly radius: number = 1,
        private readonly center: readonly [number, number, number] = [0, 0, 0],
        private readonly speed: number = 1,
    ) {}

    sample(rng: () => number): SpawnSample {
        const u = rng() * 2 - 1;
        const theta = rng() * 2 * Math.PI;
        const r = Math.sqrt(1 - u * u);
        const dx = r * Math.cos(theta);
        const dy = u;
        const dz = r * Math.sin(theta);
        const cx = this.center[0] ?? 0;
        const cy = this.center[1] ?? 0;
        const cz = this.center[2] ?? 0;
        return {
            position: [cx + dx * this.radius, cy + dy * this.radius, cz + dz * this.radius] as const,
            velocity: [dx * this.speed, dy * this.speed, dz * this.speed] as const,
        };
    }
}
