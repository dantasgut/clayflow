import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Opções dos alvos da cena. */
export interface FrameTargetsOptions {
    /** Amostras por pixel (MSAA): 4 suaviza as bordas da geometria; 1 desliga. Default 4. */
    readonly samples?: 1 | 4;
}

/**
 * Alvos da cena do quadro (Camada 4): a cor (`color`, no formato do canvas, lida pelo pós) e a profundidade (`depth`,
 * `depth24plus`), do tamanho do canvas e recriadas pela C2 quando ele muda. Com MSAA (spec 008, `samples: 4`, o
 * padrão), também a cor multiamostrada (`samples`): os passes da cena desenham nela e resolvem na `color`; a
 * profundidade tem as mesmas amostras. Um por cena, inserido pela aplicação.
 */
export class FrameTargets extends Entity<Record<string, never>> implements Resource {
    /** Identidade dos alvos na cena (o World indexa pelo schema da classe); sem dados de GPU próprios. */
    static readonly schema = new StructSchema('FrameTargets', { _unused: FieldType.u32 });

    state: ResourceState = ResourceState.Uninitialized;
    /** Amostras por pixel (1 = sem MSAA). */
    readonly samples: 1 | 4;

    constructor(options: FrameTargetsOptions = {}) {
        super();
        this.samples = options.samples ?? 4;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const samples = this.samples;
        return [
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: 'canvas', sizeFromCanvas: true },
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: {
                    format: 'depth24plus',
                    sizeFromCanvas: true,
                    ...(samples > 1 ? { sampleCount: samples } : {}),
                },
            },
            ...(samples > 1
                ? [
                      {
                          id: 'samples',
                          role: 'texture' as const,
                          textureShape: {
                              format: 'canvas' as const,
                              sizeFromCanvas: true,
                              sampleCount: samples,
                          },
                      },
                  ]
                : []),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
