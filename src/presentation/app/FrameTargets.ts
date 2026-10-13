import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Alvos da cena do quadro (Camada 4): a cor (`color`, no formato do canvas) e a profundidade (`depth`,
 * `depth24plus`), ambas do tamanho do canvas e recriadas pela C2 quando ele muda. O render principal desenha neles;
 * o pós-processamento lê a cor e escreve no canvas. Um por cena, inserido pela aplicação.
 */
export class FrameTargets extends Entity<Record<string, never>> implements Resource {
    /** Identidade dos alvos na cena (o World indexa pelo schema da classe); sem dados de GPU próprios. */
    static readonly schema = new StructSchema('FrameTargets', { _unused: FieldType.u32 });

    state: ResourceState = ResourceState.Uninitialized;

    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: 'canvas', sizeFromCanvas: true },
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth24plus', sizeFromCanvas: true },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
