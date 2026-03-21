import { ParametricGeometry } from './ParametricGeometry';

/**
 * Plano no eixo XZ gerado parametricamente. (Camada 3)
 *
 * Normal aponta para +Y. u → X, v → Z.
 */
export class PlaneGeometry extends ParametricGeometry {
    constructor(
        width:     number = 1,
        depth:     number = 1,
        widthSegs: number = 1,
        depthSegs: number = 1,
    ) {
        super((u, v) => ({
            position: [(u - 0.5) * width, 0, (v - 0.5) * depth],
            normal:   [0, 1, 0],
            uv:       [u, v],
        }), widthSegs, depthSegs);
    }
}
