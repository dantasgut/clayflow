import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { cameraPoint } from '../scene/flows/shaders';

/**
 * Função do ponto `camera` (spec 009) — vista e projeção de uma câmera escritas pelo usuário em WGSL:
 *
 * ```wgsl
 * fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut
 * // opcional: projeção de um ponto da vista para o clip (projeções não lineares, por vértice no desenho)
 * fn camera_project(view_pos: vec3f, data: CameraFnParams) -> vec4f
 * ```
 *
 * `c` são os parâmetros da `Camera`, `world` a matriz de mundo do `Transform` dela, `aspect` a razão em uso, `data`
 * os parâmetros declarados em `params` e `time` o tempo simulado (s). Anexada à entidade da câmera, substitui a
 * composição padrão (a `viewProjection` é `projection · view`). Com `camera_project`, o desenho da câmera ativa
 * projeta cada vértice por ela (a sombra continua com a câmera da luz); triângulos grandes não se curvam — malhas
 * finas. Uma instância por câmera.
 */
export class CameraFunction extends ExtensionFunction {
    /** Registro de parâmetros das funções `camera` (um pool por ponto). */
    static readonly schema = cameraPoint.record;

    constructor(options: ExtensionFunctionOptions) {
        super(cameraPoint, options);
    }

    /** A função define `camera_project` (projeção de ponto no desenho). */
    get projects(): boolean {
        return this.point.optionalIn(this.module).some((s) => s.name === 'camera_project');
    }
}
