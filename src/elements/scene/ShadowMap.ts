import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { NONE } from '../../scene/shaders/engineConstants';

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
    /**
     * A vista de sombra do mapa no atlas único da cena (spec 013): o índice da faixa dele (`ShadowAtlas`); `NONE` fora
     * das vistas vivas (sem atlas, ou acima do teto de vistas) — a luz não tem sombra.
     */
    view: number;
}

/** Projeção de uma vista de sombra (spec 013, R3). */
export type ShadowViewProjection = 'orthographic' | 'perspective';

/**
 * Uma vista de sombra declarada pelo mapa (spec 013, R3): um referencial com a sua faixa da tabela e dos pedidos no
 * atlas único. A luz direcional declara uma, ortográfica (os níveis em volta da câmera).
 */
export interface ShadowViewDeclaration {
    /** A projeção da vista. */
    readonly projection: ShadowViewProjection;
}

/** As vistas de uma luz direcional: uma, ortográfica. */
export const DIRECTIONAL_SHADOW_VIEWS: readonly ShadowViewDeclaration[] = Object.freeze([
    Object.freeze({ projection: 'orthographic' as const }),
]);

/** O que o mapa avisa ao atlas onde está (o `ShadowAtlas`): o tamanho dele mudou. */
export interface ShadowMapHost {
    /** Ajusta as faixas e o reservatório aos mapas vivos. */
    fit(): void;
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
 * Páginas físicas por lado que uma vista pede ao atlas (o atlas tem o quadrado delas): tantas quanto as de um nível (o
 * que a tela pede por nível cabe com folga; os níveis seguintes pedem uma fração), no mínimo 16 e no máximo 48 por lado.
 * Com mais vistas vivas, `shadowAtlasPagesFor` (`ShadowAtlas`).
 */
export function shadowAtlasPages(pagesPerLevel: number): number {
    return Math.min(48, Math.max(16, pagesPerLevel));
}

/** Palavras da tabela de páginas de uma vista (a faixa dela no atlas): 4 por página virtual (`vec4u`), os níveis todos reservados. */
export function shadowTableWords(pagesPerLevel: number): number {
    return SHADOW_MAX_LEVELS * pagesPerLevel * pagesPerLevel * 4;
}

/** Palavras de uma página física do atlas (a página e a borda, `SHADOW_PAGE_STRIDE²`). */
export const SHADOW_PAGE_WORDS = SHADOW_PAGE_STRIDE * SHADOW_PAGE_STRIDE;

/**
 * Mapa de sombra virtual de uma luz (Camada 3; spec 034, T060 — o padrão dos mapas de sombra virtuais): níveis em volta
 * da câmera, cada um com o dobro do lado do anterior e a mesma resolução virtual (`size`), divididos em páginas de 128²
 * ancoradas no espaço da luz. Só as páginas que a imagem usa existem: a profundidade da cena de um quadro marca as
 * páginas pedidas, o estágio de sombra do quadro seguinte as aloca no atlas, guarda-as na tabela de páginas e desenha só
 * as novas e as tocadas por quem se moveu ou se deformou — as demais seguem do quadro anterior.
 *
 * O mapa guarda os parâmetros da sombra da luz e a **vista** dela (spec 013, R3); as páginas, a tabela e os pedidos são
 * do atlas único da cena (`ShadowAtlas`), onde cada vista tem a sua faixa. Uma luz direcional tem uma vista
 * (ortográfica, os níveis em volta da câmera).
 *
 * Os vieses, o tamanho, o primeiro nível e a vista em pool (`array<ShadowMap>`); o referencial do quadro (a base da luz,
 * a câmera no espaço dela, a faixa de profundidade, as bases da faixa) num segundo descritor do mesmo slot (pool
 * `ShadowMatrix`, produzido só na GPU pelo `ShadowMatrixFlow`). Anexado pela `DirectionalLight` que projeta sombra.
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
        view: FieldType.u32,
    });

    /**
     * Produto do `ShadowMatrixFlow`, só na GPU (pool `ShadowMatrix`, mesmo slot do mapa; série temporal de 2 quadros): o
     * referencial do mapa virtual no quadro — `lightView` (mundo → luz: as linhas são os eixos x e y do plano da luz e a
     * direção da luz), a vista-projeção da câmera (zero sem câmera: a reserva grossa sem o teste do frustum), a câmera no
     * espaço da luz (`camera.xyz`; `camera.w` = níveis ativos), a direção do referencial
     * (`direction.xyz`: a da luz quando o cache das páginas recomeça e, enquanto ele vale, a com que foi desenhado;
     * `direction.w` = 1 quando o cache não vale neste quadro: luz, nível ou série mudados), o meio
     * lado do primeiro nível, a meia faixa de profundidade de uma página (m) e a rotação do padrão da penumbra e o
     * deslocamento das amostras dentro do texel (spec 034: pela sequência do antisserrilhado; sem ele, (1, 0) e 0).
     *
     * A vista no atlas único (spec 013): `tableBase` e `requestBase`, a primeira palavra da tabela da vista no atlas e a
     * dos pedidos dela; `pagesBase`, a primeira palavra das páginas físicas (a mesma em todas as vistas); `kind`, a
     * projeção (0 ortográfica, 1 perspectiva); `origin`, a posição da luz, e `near` e `far`, os planos, nas vistas em
     * perspectiva (zero na ortográfica).
     */
    static readonly matrixSchema = new StructSchema('ShadowMatrix', {
        lightView: FieldType.mat4x4f,
        viewProjection: FieldType.mat4x4f,
        camera: FieldType.vec4f,
        direction: FieldType.vec4f,
        cacheDirection: FieldType.vec4f,
        origin: FieldType.vec4f,
        kernelRotation: FieldType.vec2f,
        texelJitter: FieldType.vec2f,
        firstLevelRadius: FieldType.f32,
        depthRange: FieldType.f32,
        pagesPerLevel: FieldType.u32,
        atlasPages: FieldType.u32,
        tableBase: FieldType.u32,
        requestBase: FieldType.u32,
        pagesBase: FieldType.u32,
        kind: FieldType.u32,
        near: FieldType.f32,
        far: FieldType.f32,
    });

    state: ResourceState = ResourceState.Uninitialized;
    /** Os valores fixados pela autoria (nas opções): o perfil do `Renderer` não os muda (spec 034, T079). */
    readonly authored: ReadonlySet<ShadowMapProfileField>;
    /** As vistas de sombra da luz do mapa (a direcional: uma, ortográfica). */
    readonly views: readonly ShadowViewDeclaration[] = DIRECTIONAL_SHADOW_VIEWS;
    /** O atlas onde o mapa tem a vista (posto por ele; `undefined` fora das vistas vivas). */
    private host: ShadowMapHost | undefined;

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
            view: NONE.value,
        };
    }

    /**
     * A vista do mapa no atlas único: `host` com a faixa `view` ao entrar nas vistas vivas; `undefined` ao sair. Chamado
     * pelo `ShadowAtlas`.
     */
    place(host: ShadowMapHost | undefined, view: number): void {
        this.host = host;
        const next = host === undefined ? NONE.value : view;
        if (this.rawData.view !== next) this.data.view = next;
    }

    /**
     * Os valores do `Renderer` (spec 034, T079): os que a autoria não fixou. A resolução nova muda as páginas por nível;
     * o atlas onde o mapa está ajusta as faixas (e a C2 o realoca).
     */
    fromRenderer(resolution: number, penumbraSamples: number): void {
        const d = this.rawData;
        if (!this.authored.has('penumbraSamples') && d.penumbraSamples !== penumbraSamples) {
            checkSamples(penumbraSamples);
            this.data.penumbraSamples = penumbraSamples;
        }
        if (!this.authored.has('size') && (d.size[0] !== resolution || d.size[1] !== resolution)) {
            checkSize([resolution, resolution]);
            this.data = {
                ...this.rawData,
                size: [resolution, resolution],
                pagesPerLevel: shadowPagesPerLevel([resolution, resolution]),
            };
            this.host?.fit();
        }
    }

    /** Parâmetros (a CPU envia a cada mutação) e o referencial do quadro (produzido só pela GPU). */
    getDescriptors(): readonly GPUDescriptor[] {
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
