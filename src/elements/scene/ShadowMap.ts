import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/** Opções de `ShadowMap`. */
export interface ShadowMapOptions {
    /** Viés de profundidade da comparação (contra acne), em texels do mapa. Padrão 1. */
    readonly bias?: number;
    /**
     * Deslocamento da consulta ao longo da normal da superfície, em texels do mapa (mais quanto mais rasante a luz).
     * Padrão 1,5.
     */
    readonly normalBias?: number;
    /**
     * Resolução do mapa em texels `[largura, altura]`. Sem ela, a do perfil do `Renderer` da cena (`shadows.resolution`;
     * `[1024, 1024]` sem renderizador).
     */
    readonly size?: readonly [number, number];
    /**
     * Amostras da penumbra (o filtro da borda): 1, 4 (2 × 2) ou 9 (3 × 3). Sem ela, a do perfil do `Renderer`
     * (`shadows.penumbraSamples`; 9 sem renderizador).
     */
    readonly penumbraSamples?: number;
}

/** Amostras da penumbra aceitas (grades 1 × 1, 2 × 2 e 3 × 3 em torno do ponto). */
export const SHADOW_PENUMBRA_SAMPLES = [1, 4, 9] as const;

/** Os valores do mapa que o perfil do `Renderer` preenche. */
export type ShadowMapProfileField = 'size' | 'penumbraSamples';

/** Dado de um `ShadowMap` (layout de `ShadowMap.schema`). */
export interface ShadowMapData {
    /** Viés de profundidade da comparação, em texels. */
    bias: number;
    /** Deslocamento ao longo da normal, em texels. */
    normalBias: number;
    /** Tamanho. */
    size: readonly [number, number];
    /** Amostras da penumbra (1, 4 ou 9). */
    penumbraSamples: number;
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
        penumbraSamples: FieldType.u32,
    });

    /**
     * Produto do `ShadowMatrixFlow`, só na GPU (pool `ShadowMatrix`, mesmo slot do mapa): a matriz e a rotação do padrão
     * do PCF no quadro (cosseno, seno). Com o deslocamento da amostra (spec 034), a matriz traz a grade do mapa deslocada
     * dentro do texel e o padrão gira, pela mesma sequência — o acúmulo temporal integra o mapa supersamplado; sem ele, a
     * grade parada e (1, 0).
     */
    static readonly matrixSchema = new StructSchema('ShadowMatrix', {
        lightViewProj: FieldType.mat4x4f,
        kernelRotation: FieldType.vec2f,
    });

    state: ResourceState = ResourceState.Uninitialized;
    /** Os valores fixados pela autoria (nas opções): o perfil do `Renderer` não os muda (spec 034, T079). */
    readonly authored: ReadonlySet<ShadowMapProfileField>;

    constructor(options: ShadowMapOptions = {}) {
        super();
        const samples = options.penumbraSamples ?? 9;
        checkSamples(samples);
        if (options.size !== undefined) checkSize(options.size);
        this.authored = new Set<ShadowMapProfileField>([
            ...(options.size !== undefined ? (['size'] as const) : []),
            ...(options.penumbraSamples !== undefined ? (['penumbraSamples'] as const) : []),
        ]);
        this.data = {
            bias: options.bias ?? 1,
            normalBias: options.normalBias ?? 1.5,
            size: options.size ?? [1024, 1024],
            penumbraSamples: samples,
        };
    }

    /**
     * Os valores do `Renderer` (spec 034, T079): os que a autoria não fixou. A resolução nova realoca a textura de
     * profundidade pela C2.
     */
    fromRenderer(resolution: number, penumbraSamples: number): void {
        const d = this.rawData;
        if (!this.authored.has('penumbraSamples') && d.penumbraSamples !== penumbraSamples) {
            checkSamples(penumbraSamples);
            this.data.penumbraSamples = penumbraSamples;
        }
        if (!this.authored.has('size') && (d.size[0] !== resolution || d.size[1] !== resolution)) {
            checkSize([resolution, resolution]);
            this.redescribe(this.getDescriptors(), {
                ...this.rawData,
                size: [resolution, resolution],
            });
        }
    }

    /** Parâmetros (CPU envia a cada mutação) + matriz (produzida só pela GPU) + textura de profundidade. */
    getDescriptors(): readonly GPUDescriptor[] {
        const [width, height] = this.rawData.size;
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
            // Amostrador de comparação do PCF (spec 031): do mapa, para quem lê a sombra não criar o seu.
            {
                id: 'compare',
                role: 'sampler',
                samplerShape: { magFilter: 'linear', minFilter: 'linear', compare: 'less' },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

/** @throws RangeError fora de 1, 4 ou 9. */
function checkSamples(n: number): void {
    if (!(SHADOW_PENUMBRA_SAMPLES as readonly number[]).includes(n))
        throw new RangeError(`ShadowMap: penumbraSamples ${n} fora de {1, 4, 9}.`);
}

/**
 * @throws RangeError fora de 1–8192 inteiros por lado (8192: o mínimo garantido de `maxTextureDimension2D` do WebGPU —
 * todo adaptador concede).
 */
function checkSize(size: readonly [number, number]): void {
    if (!size.every((n) => Number.isInteger(n) && n >= 1 && n <= 8192))
        throw new RangeError(`ShadowMap: size [${size.join(', ')}] fora de 1–8192 por lado.`);
}
