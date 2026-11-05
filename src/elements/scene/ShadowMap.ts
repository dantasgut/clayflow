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
     * Resolução virtual de cada nível do mapa em texels `[largura, altura]` (o maior lado vale; spec 034, T060: páginas de
     * 128², em número par por lado, de 4 a 64). Sem ela, a do perfil do `Renderer` da cena (`shadows.resolution`;
     * `[4096, 4096]` sem renderizador).
     */
    readonly size?: readonly [number, number];
    /**
     * Meio lado, em metros, do primeiro nível (o mais fino) em volta da câmera; cada nível seguinte dobra. Padrão 1.
     */
    readonly firstLevelRadius?: number;
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
    /** Meio lado do primeiro nível, em metros. */
    firstLevelRadius: number;
    /** Páginas por lado de um nível (par, 4–64): `size` / 128. */
    pagesPerLevel: number;
    /** Páginas físicas por lado do atlas. */
    atlasPages: number;
}

/** Texels por lado de uma página do mapa virtual. */
export const SHADOW_PAGE_TEXELS = 128;
/** Texels por lado de uma página no atlas: a página e a borda de 1 texel (a filtragem não atravessa a vizinha). */
export const SHADOW_PAGE_STRIDE = SHADOW_PAGE_TEXELS + 2;
/** Níveis no máximo (a tabela de páginas reserva todos). */
export const SHADOW_MAX_LEVELS = 16;

/** Páginas por lado de um nível para a resolução `size` (par, 4–64). */
export function shadowPagesPerLevel(size: readonly [number, number]): number {
    const side = Math.max(size[0], size[1]);
    return Math.min(64, Math.max(4, 2 * Math.ceil(side / (2 * SHADOW_PAGE_TEXELS))));
}

/**
 * Páginas físicas por lado do atlas: tantas quanto as de um nível (o que a tela pede por nível cabe com folga; os
 * níveis seguintes pedem uma fração), no mínimo 16 e no máximo 48 por lado (6240 texels: dentro do mínimo garantido de
 * `maxTextureDimension2D`).
 */
export function shadowAtlasPages(pagesPerLevel: number): number {
    return Math.min(48, Math.max(16, pagesPerLevel));
}

/**
 * Mapa de sombra virtual de uma luz (Camada 3; spec 034, T060 — o padrão dos mapas de sombra virtuais): níveis em volta
 * da câmera, cada um com o dobro do lado do anterior e a mesma resolução virtual (`size`), divididos em páginas de 128²
 * ancoradas no espaço da luz. Só as páginas que a imagem usa existem: a profundidade da cena de um quadro marca as
 * páginas pedidas (`requests`), o estágio de sombra do quadro seguinte as aloca num atlas de páginas físicas (`depth`),
 * guardado na tabela de páginas (`pages`), e desenha só as novas e as tocadas por quem se moveu ou se deformou — as
 * demais seguem do quadro anterior. As três são séries temporais (spec 037): a tabela e os pedidos do quadro anterior
 * pelo atraso 1; o atlas, série por páginas (um alvo só, com o carimbo de cada página e a época da C2).
 *
 * Os vieses, o tamanho e o primeiro nível em pool (`array<ShadowMap>`); o referencial do quadro (a base da luz, a
 * câmera no espaço dela, a faixa de profundidade) num segundo descritor do mesmo slot (pool `ShadowMatrix`, produzido
 * só na GPU pelo `ShadowMatrixFlow`). Anexado pela `DirectionalLight` que projeta sombra.
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
        firstLevelRadius: FieldType.f32,
        pagesPerLevel: FieldType.u32,
        atlasPages: FieldType.u32,
    });

    /**
     * Produto do `ShadowMatrixFlow`, só na GPU (pool `ShadowMatrix`, mesmo slot do mapa; série temporal de 2 quadros): o
     * referencial do mapa virtual no quadro — `lightView` (mundo → luz: as linhas são os eixos x e y do plano da luz e a
     * direção da luz), a vista-projeção da câmera (zero sem câmera: a reserva grossa sem o teste do frustum), a câmera no
     * espaço da luz (`camera.xyz`; `camera.w` = níveis ativos), a direção da luz
     * (`direction.xyz`; `direction.w` = 1 quando o cache não vale neste quadro: luz, nível ou série mudados), o meio
     * lado do primeiro nível, a meia faixa de profundidade de uma página (m) e a rotação do padrão da penumbra e o
     * deslocamento das amostras dentro do texel (spec 034: pela sequência do antisserrilhado; sem ele, (1, 0) e 0).
     */
    static readonly matrixSchema = new StructSchema('ShadowMatrix', {
        lightView: FieldType.mat4x4f,
        viewProjection: FieldType.mat4x4f,
        camera: FieldType.vec4f,
        direction: FieldType.vec4f,
        kernelRotation: FieldType.vec2f,
        texelJitter: FieldType.vec2f,
        firstLevelRadius: FieldType.f32,
        depthRange: FieldType.f32,
        pagesPerLevel: FieldType.u32,
        atlasPages: FieldType.u32,
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
        const size = options.size ?? [4096, 4096];
        const radius = options.firstLevelRadius ?? 1;
        if (!(Number.isFinite(radius) && radius > 0))
            throw new RangeError(`ShadowMap: firstLevelRadius ${radius} precisa ser positivo.`);
        const pages = shadowPagesPerLevel(size);
        this.data = {
            bias: options.bias ?? 1,
            normalBias: options.normalBias ?? 1.5,
            size,
            penumbraSamples: samples,
            firstLevelRadius: radius,
            pagesPerLevel: pages,
            atlasPages: shadowAtlasPages(pages),
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
            const pages = shadowPagesPerLevel([resolution, resolution]);
            this.redescribe(this.getDescriptors(), {
                ...this.rawData,
                size: [resolution, resolution],
                pagesPerLevel: pages,
                atlasPages: shadowAtlasPages(pages),
            });
        }
    }

    /**
     * Parâmetros (CPU envia a cada mutação) + referencial do quadro (produzido só pela GPU) + o atlas das páginas, a
     * tabela de páginas e os pedidos (séries temporais) + o amostrador de comparação.
     */
    getDescriptors(): readonly GPUDescriptor[] {
        const { pagesPerLevel, atlasPages } = this.rawData;
        const atlas = atlasPages * SHADOW_PAGE_STRIDE;
        // A tabela e os pedidos: um texel por página virtual, os níveis empilhados (N × N·16).
        const table = { width: pagesPerLevel, height: pagesPerLevel * SHADOW_MAX_LEVELS };
        return [
            { id: 'shadowmap', role: 'storage-ro', schema: ShadowMap.schema, storage: 'pool' },
            {
                id: 'matrix',
                role: 'storage-rw',
                storage: 'pool',
                schema: ShadowMap.matrixSchema,
                upload: 'never',
                // A luz e o primeiro nível do quadro anterior: mudados, o cache recomeça.
                history: { depth: 2 },
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth32float', width: atlas, height: atlas },
                // Série por páginas (T060a): um alvo só, o tempo guardado por página (o carimbo e a época da C2); só
                // as páginas sujas são redesenhadas, as demais seguem onde estão.
                history: { depth: 1, pages: { tile: [SHADOW_PAGE_STRIDE, SHADOW_PAGE_STRIDE] } },
            },
            {
                id: 'pages',
                role: 'storage-texture',
                textureShape: { format: 'rgba32uint', ...table, access: 'write-only' },
                history: { depth: 2 },
            },
            {
                id: 'requests',
                role: 'storage-texture',
                textureShape: { format: 'r32uint', ...table, access: 'write-only' },
                history: { depth: 2 },
            },
            // Amostrador de comparação da penumbra (spec 031): do mapa, para quem lê a sombra não criar o seu.
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
