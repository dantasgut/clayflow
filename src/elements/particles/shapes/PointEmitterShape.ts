import type { EmitterShape, SpawnSample } from '../../../scene/systems/particles/EmitterShape';

/**
 * Emissão pontual — todas as partículas nascem na origem local. (Camada 3)
 * Direção uniformemente distribuída em hemisfério superior por padrão.
 */
export class PointEmitterShape implements EmitterShape {
    public readonly id = 'point';

    public sample(): SpawnSample {
        // Direção aleatória na esfera unitária
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        return {
            position:  [0, 0, 0],
            direction: [
                Math.sin(phi) * Math.cos(theta),
                Math.sin(phi) * Math.sin(theta),
                Math.cos(phi),
            ],
        };
    }
}
