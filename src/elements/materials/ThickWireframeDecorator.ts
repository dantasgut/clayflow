import type { Material } from '../../scene/components/Material';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { MaterialDecorator } from './MaterialDecorator';

/**
 * Decorator de wireframe com linhas espessas via expansão em quad. (Camada 3)
 *
 * Requer `EdgeGeometry` como geometria do Mesh — o vertex shader `thick-wireframe`
 * espera o layout `posA(3) + posB(3) + side(1)`.
 *
 * Binding 1 do shader recebe um uniform com `[lineWidth, screenHeight, 0, 0]`.
 * O shader computa a perpendicular em espaço de tela e desloca ±(lineWidth / screenHeight).
 *
 * @example
 * const geo = new EdgeGeometry(new BoxGeometry());
 * const mat = new ThickWireframeDecorator(new StandardMaterial({ color: [0, 1, 0, 1] }), 2.0);
 * scene.add(new Mesh(geo, mat));
 */
export class ThickWireframeDecorator extends MaterialDecorator {
    public lineWidth: number;

    private lineUboId: string = '';

    constructor(inner: Material, lineWidth: number = 2.0) {
        super(inner);
        this.topology = 'triangle-list';
        this.shaderId = 'thick-wireframe';
        this.lineWidth = lineWidth;

        // Adiciona entrada de bind group para o uniform de linha (binding 1)
        this.bindGroupSchema = [
            ...inner.bindGroupSchema,
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform' as GPUBufferBindingType },
            },
        ];
    }

    public allocateResource(resourceManager: ResourceManager): void {
        // Aloca o material interno (binding 0)
        this._inner.allocateResource(resourceManager);
        this.bindGroupIds = [...this._inner.bindGroupIds];
        this.state        = this._inner.state;

        // Aloca o uniform de lineWidth (binding 1)
        const data = new Float32Array([this.lineWidth, 0, 0, 0]);
        this.lineUboId = `thick_line_ubo_${this.uuid}`;
        const ubo = resourceManager.buffers.createUniformBuffer(this.lineUboId, data.byteLength);
        resourceManager.buffers.writeBuffer(this.lineUboId, data);

        resourceManager.bindings.getBindGroup(
            `thick_line_bg_${this.uuid}`,
            this.shaderId,
            [{ binding: 1, resource: { buffer: ubo.native } }],
        );
        // Armazena a chave lógica (não o UUID interno) para lookup e dispose corretos.
        this.bindGroupIds.push(`thick_line_bg_${this.uuid}`);
    }

    public updateResource(resourceManager: ResourceManager): void {
        this._inner.updateResource(resourceManager);
        this.state = this._inner.state;

        // Atualiza lineWidth se o decorator foi marcado como dirty
        const data = new Float32Array([this.lineWidth, 0, 0, 0]);
        resourceManager.buffers.writeBuffer(this.lineUboId, data);
    }

    public disposeResource(resourceManager: ResourceManager): void {
        super.disposeResource(resourceManager);
        resourceManager.buffers.destroyBuffer(this.lineUboId);
        this.lineUboId = '';
    }
}
