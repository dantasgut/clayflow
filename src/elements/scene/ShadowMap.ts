import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Opções de `ShadowMap`. */
export interface ShadowMapOptions {
    /** Viés de profundidade da comparação (contra acne). Padrão 0,005. */
    readonly bias?: number;
    /** Viés ao longo da normal. Padrão 0,001. */
    readonly normalBias?: number;
    /** Resolução do mapa em texels `[largura, altura]`. Padrão `[1024, 1024]`. */
    readonly size?: readonly [number, number];
}

/** Dado de um `ShadowMap` (layout de `ShadowMap.schema`). */
export interface ShadowMapData {
    bias: number;
    normalBias: number;
    size: readonly [number, number];
}

/**
 * Mapa de sombra de uma luz (Camada 3): vieses e tamanho em pool (`array<ShadowMap>` no shader), a matriz
 * luz-vista-projeção num segundo descritor do mesmo slot (pool `ShadowMatrix`, produzida só na GPU pelo
 * `ShadowMatrixFlow` a partir da direção da luz — spec 007, research R11) e a textura de profundidade `depth32float` em
 * que o estágio de sombra desenha. O render principal lê os dois pools pelo slot do mapa. Anexado pela
 * `DirectionalLight` que projeta sombra; o tamanho vale na inserção.
 *
 * Mudança incompatível: `lightViewProj` não é mais dado nem opção do `ShadowMap` — ver o guia de migração.
 */
export class ShadowMap extends Entity<ShadowMapData> implements Resource {
    /** Parâmetros do mapa (pool `ShadowMap`): vieses e tamanho, enviados a cada mutação. */
    static readonly schema = new StructSchema('ShadowMap', {
        bias: FieldType.f32,
        normalBias: FieldType.f32,
        size: FieldType.vec2f,
    });

    /** Produto do `ShadowMatrixFlow`, só na GPU (pool `ShadowMatrix`, mesmo slot do mapa). */
    static readonly matrixSchema = new StructSchema('ShadowMatrix', {
        lightViewProj: FieldType.mat4x4f,
    });

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: ShadowMapOptions = {}) {
        super();
        this.data = {
            bias: options.bias ?? 0.005,
            normalBias: options.normalBias ?? 0.001,
            size: options.size ?? [1024, 1024],
        };
    }

    /** Parâmetros (CPU envia a cada mutação) + matriz (produzida só pela GPU) + textura de profundidade. */
    getDescriptors(): readonly GPUDescriptor[] {
        const [width, height] = this.data.size;
        return [
            { id: 'shadowmap', role: 'storage-ro', schema: ShadowMap.schema, storage: 'pool' },
            {
                id: 'matrix',
                role: 'storage-rw',
                storage: 'pool',
                schema: ShadowMap.matrixSchema,
                upload: 'never',
            },
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
