import { Material } from '../../scene/components/Material';

export interface WireframeMaterialOptions {
    color?:     [number, number, number, number];
    lineWidth?: number;
}

/**
 * Material de wireframe espesso renderizado via vertex pulling. (Camada 3)
 *
 * Usa o shader `thick-wireframe` com vertex pulling:
 * o renderer lê o VBO e IBO como storage buffers em @group(3) e emite
 * 18 vértices por triângulo (3 arestas × 2 triângulos de quad × 3 vértices).
 * O desenvolvedor não precisa conhecer nenhum desses detalhes.
 *
 * @group(2) @binding(0) — WireframeUniforms: color (vec4f) + lineWidth (f32) + padding
 *
 * @example
 * const box = new Mesh(
 *     new BoxGeometry(),
 *     new WireframeMaterial({ color: [0.2, 0.8, 0.4, 1], lineWidth: 2 }),
 * );
 */
export class WireframeMaterial extends Material {
    public lineWidth: number;

    constructor(opts: WireframeMaterialOptions = {}) {
        super();

        const color    = opts.color    ?? [1, 1, 1, 1];
        this.lineWidth = opts.lineWidth ?? 2.0;

        this.shaderId        = 'thick-wireframe';
        this.topology        = 'triangle-list';
        this.transparent     = true;
        this.useVertexPulling = true;

        this.bindGroupSchema = [
            {
                binding:    0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer:     { type: 'uniform' as GPUBufferBindingType },
            },
        ];

        // color(4) + lineWidth(1) + padding(3) = 8 floats = 32 bytes
        this.rawUniforms.set('std_mat_buf', new Float32Array([
            ...color,
            this.lineWidth, 0, 0, 0,
        ]));
    }
}
