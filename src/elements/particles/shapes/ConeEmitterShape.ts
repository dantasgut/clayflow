import type { EmitterShape, SpawnSample } from './EmitterShape';

export class ConeEmitterShape implements EmitterShape {
    constructor(
        private readonly origin: readonly [number, number, number] = [0, 0, 0],
        private readonly direction: readonly [number, number, number] = [0, 1, 0],
        private readonly halfAngle: number = Math.PI / 6,
        private readonly speed: number = 1,
    ) {}

    sample(rng: () => number): SpawnSample {
        const cosTheta = 1 - rng() * (1 - Math.cos(this.halfAngle));
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const phi = rng() * 2 * Math.PI;
        const dx = sinTheta * Math.cos(phi);
        const dy = cosTheta;
        const dz = sinTheta * Math.sin(phi);
        const ox = this.origin[0] ?? 0;
        const oy = this.origin[1] ?? 0;
        const oz = this.origin[2] ?? 0;
        const dirx = this.direction[0] ?? 0;
        const diry = this.direction[1] ?? 1;
        const dirz = this.direction[2] ?? 0;
        const speed = this.speed;
        return {
            position: [ox, oy, oz] as const,
            velocity: [dx * speed + dirx, dy * speed + diry, dz * speed + dirz] as const,
        };
    }
}
