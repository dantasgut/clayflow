import { SDFCollider } from '../SDFCollider';

/**
 * Forma de colisão de plano infinito. (Camada 3)
 *
 * SDF: p · n - d  (semiespaço definido por normal n e deslocamento d)
 * Por padrão: plano XZ com normal +Y, tudo abaixo de y=0 é interior.
 *
 * @example
 * // Plano inclinado 45°
 * new PlaneShape([0.707, 0.707, 0], 0);
 */
export class PlaneShape extends SDFCollider {
    constructor(
        normal: [number, number, number] = [0, 1, 0],
        offset: number = 0,
    ) {
        const [nx, ny, nz] = normal;
        super({
            sdf: (p) => p[0]! * nx! + p[1]! * ny! + p[2]! * nz! - offset,
            // Plano infinito: bounding radius grande o suficiente para cobrir a cena
            boundingRadius: 1e6,
            shape: 'Plane',
        });
    }
}
