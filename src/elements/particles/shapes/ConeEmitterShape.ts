import type { EmitterShape, SpawnSample } from '../../../scene/systems/particles/EmitterShape';

/**
 * Emissão em cone ao redor do eixo +Y. (Camada 3)
 *
 * @param angle — semiângulo do cone em radianos (0 = linha, π/2 = hemisfério).
 * @param radius — raio da base do cone onde as partículas nascem (0 = ápice).
 *
 * @example
 * new ConeEmitterShape(Math.PI / 8, 0.2) // cone estreito, base pequena
 */
export class ConeEmitterShape implements EmitterShape {
    public readonly id = 'cone';

    constructor(
        public angle:  number = Math.PI / 6,
        public radius: number = 0,
    ) {}

    public sample(): SpawnSample {
        // Posição aleatória na base circular do cone
        const a = Math.random() * Math.PI * 2;
        const r = this.radius * Math.sqrt(Math.random());
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;

        // Direção dentro do ângulo do cone (eixo +Y)
        const theta = Math.random() * Math.PI * 2;
        const cosAngle = Math.cos(this.angle);
        const z = cosAngle + Math.random() * (1 - cosAngle); // uniforme no cap
        const s = Math.sqrt(1 - z * z);
        return {
            position:  [px, 0, pz],
            direction: [s * Math.cos(theta), z, s * Math.sin(theta)],
        };
    }
}
