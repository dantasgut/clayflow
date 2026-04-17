import { ParametricGeometry } from './ParametricGeometry';

/**
 * Esfera unitária gerada por coordenadas esféricas. (Camada 3)
 *
 * Parametrização:
 *   θ (azimute) = u · 2π   ∈ [0, 2π]
 *   φ (polar)   = v · π    ∈ [0, π]
 *
 *   x = r · sin(φ) · cos(θ)
 *   y = r · cos(φ)
 *   z = r · sin(φ) · sin(θ)
 *
 * A normal é o vetor unitário na direção do ponto (esfera centrada na origem).
 */
export class SphereGeometry extends ParametricGeometry {
    constructor(
        radius:         number = 1,
        widthSegments:  number = 32,
        heightSegments: number = 16,
    ) {
        super((u, v) => {
            const theta  = u * Math.PI * 2;
            const phi    = v * Math.PI;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const nx = sinPhi * Math.cos(theta);
            const ny = cosPhi;
            const nz = sinPhi * Math.sin(theta);

            return {
                position: [radius * nx, radius * ny, radius * nz],
                normal:   [nx, ny, nz],
                uv:       [u, v],
            };
        }, widthSegments, heightSegments);
    }
}
