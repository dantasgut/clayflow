import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Opções de `ShadowMap`. */
export interface ShadowMapOptions {
    /** Matriz luz-vista-projeção inicial (o estágio de sombra a recalcula pela luz). Padrão: identidade. */
    readonly lightViewProj?: readonly number[];
    /** Viés de profundidade da comparação (contra acne). Padrão 0,005. */
    readonly bias?: number;
    /** Viés ao longo da normal. Padrão 0,001. */
    readonly normalBias?: number;
    /** Resolução do mapa em texels `[largura, altura]`. Padrão `[1024, 1024]`. */
    readonly size?: readonly [number, number];
}

/**
 * Mapa de sombra de uma luz (Camada 3): matriz luz-vista-projeção e vieses em pool (`array<ShadowMap>` no shader,
 * lido pelo render principal pelo slot da luz) e a textura de profundidade `depth32float` em que o estágio de sombra
 * desenha. Anexado pela `DirectionalLight` que projeta sombra; o tamanho vale na inserção.
 */
export class ShadowMap extends Entity implements Resource {
    /** StructSchema do ShadowMap (lightViewProj + bias + normalBias + size). */
    static readonly schema = new StructSchema('ShadowMap', {
        lightViewProj: FieldType.mat4x4f,
        bias: FieldType.f32,
        normalBias: FieldType.f32,
        size: FieldType.vec2f,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(options: ShadowMapOptions = {}) {
        super();
        this.data = ShadowMap.schema.applyDefaults({
            lightViewProj: options.lightViewProj ?? identity(),
            bias: options.bias ?? 0.005,
            normalBias: options.normalBias ?? 0.001,
            size: options.size ?? [1024, 1024],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const [width, height] = this.data.size as readonly [number, number];
        return [
            { id: 'shadowmap', role: 'storage-ro', schema: ShadowMap.schema, storage: 'pool' },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth32float', width, height },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

function identity(): readonly number[] {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
