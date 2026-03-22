import { SDFCollider } from './SDFCollider';

/**
 * Forma de colisão de plano finito ou infinito. (Camada 3)
 *
 * SDF: p · n - d  (semiespaço definido por normal n e deslocamento d)
 * Por padrão: plano XZ com normal +Y.
 *
 * halfWidth e halfDepth definem os limites do plano em X e Z (espaço local).
 * Os algoritmos de colisão (PlaneSphereCollision, PlaneBoxCollision) rejeitam
 * contatos fora desses limites — objetos que saem da borda caem no vazio.
 *
 * @example
 * new PlaneShape([0, 1, 0], 0, 6, 6); // plano 12×12 (±6 em X e Z)
 */
export class PlaneShape extends SDFCollider {
    /** Metade da largura em X (espaço local). Infinity = sem limite. */
    public readonly halfWidth:  number;
    /** Metade da profundidade em Z (espaço local). Infinity = sem limite. */
    public readonly halfDepth:  number;

    constructor(
        normal:    [number, number, number] = [0, 1, 0],
        offset:    number = 0,
        halfWidth: number = Infinity,
        halfDepth: number = Infinity,
    ) {
        const [nx, ny, nz] = normal;
        super({
            sdf: (p) => p[0]! * nx! + p[1]! * ny! + p[2]! * nz! - offset,
            boundingRadius: isFinite(halfWidth) && isFinite(halfDepth)
                ? Math.sqrt(halfWidth ** 2 + halfDepth ** 2)
                : 1e6,
            shape: 'Plane',
        });
        this.halfWidth = halfWidth;
        this.halfDepth = halfDepth;
    }
}
