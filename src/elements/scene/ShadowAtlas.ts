import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { GpuWordSchema } from '../gpu/compute/schemas';
import {
    SHADOW_MAX_LEVELS,
    SHADOW_PAGE_WORDS,
    shadowAtlasPages,
    shadowTableWords,
    type ShadowMap,
} from './ShadowMap';

/**
 * Vistas de sombra no máximo (spec 013, R3): o teto constante dos laços da GPU que percorrem as vistas (`SV_MAX_VIEWS`
 * em `shadow_virtual.wgsl`) e o número de faixas do atlas quando nada mais o limita.
 */
export const SHADOW_MAX_VIEWS = 16;

/** Páginas físicas por lado do atlas, no máximo (o índice da página física tem 16 bits; 48² cabem num quadro). */
export const SHADOW_ATLAS_PAGES_MAX = 48;

/**
 * Páginas desenhadas por quadro, no máximo, entre todas as vistas cujo cache segue (a fila das sujas; o resto fica para
 * os quadros seguintes). A vista cujo cache recomeça (a luz mudou de direção, os grupos mudaram) leva todas as que
 * pediu, até o atlas inteiro: não há o que ler de antes.
 */
export const SHADOW_PAGE_BUDGET = 256;

/** O `maxStorageBufferBindingSize` mínimo do WebGPU (o que todo adaptador concede). */
const BINDING_SIZE_FLOOR = 134_217_728;

/** As seções do atlas único e dos pedidos (em palavras). */
export interface ShadowAtlasLayout {
    /** Faixas (vistas no máximo). */
    readonly views: number;
    /** Páginas por lado de um nível na faixa (as do maior mapa vivo). */
    readonly pagesPerLevel: number;
    /** Páginas físicas por lado. */
    readonly atlasPages: number;
    /** Palavras da tabela de uma vista: 4 por página virtual, os níveis todos. */
    readonly stripTableWords: number;
    /** Palavras dos pedidos de uma vista: 2 por página virtual. */
    readonly stripRequestWords: number;
    /** Primeira palavra das páginas físicas no atlas (depois das tabelas de todas as faixas). */
    readonly pagesBase: number;
    /** Palavras do atlas: as tabelas e as páginas físicas. */
    readonly atlasWords: number;
    /** Palavras do buffer dos pedidos. */
    readonly requestWords: number;
}

/** As seções do atlas de `views` faixas de `pagesPerLevel` páginas por nível e `atlasPages`² páginas físicas. */
export function shadowAtlasLayout(
    views: number,
    pagesPerLevel: number,
    atlasPages: number,
): ShadowAtlasLayout {
    const stripTableWords = shadowTableWords(pagesPerLevel);
    const stripRequestWords = SHADOW_MAX_LEVELS * pagesPerLevel * pagesPerLevel * 2;
    const pagesBase = views * stripTableWords;
    return {
        views,
        pagesPerLevel,
        atlasPages,
        stripTableWords,
        stripRequestWords,
        pagesBase,
        atlasWords: pagesBase + atlasPages * atlasPages * SHADOW_PAGE_WORDS,
        requestWords: views * stripRequestWords,
    };
}

/**
 * A faixa da vista `view`: a primeira palavra da tabela dela no atlas e a dos pedidos dela (a vista `v` começa em
 * `v · faixa`; as faixas não se sobrepõem).
 * @throws RangeError com a vista fora das faixas.
 */
export function shadowViewBases(
    layout: ShadowAtlasLayout,
    view: number,
): { tableBase: number; requestBase: number } {
    if (!(Number.isInteger(view) && view >= 0 && view < layout.views))
        throw new RangeError(`ShadowAtlas: vista ${view} fora das ${layout.views} faixas.`);
    return {
        tableBase: view * layout.stripTableWords,
        requestBase: view * layout.stripRequestWords,
    };
}

/**
 * Páginas físicas por lado do atlas (spec 013, R7): com uma vista, as de antes (`shadowAtlasPages`: as de um nível, de
 * 16 a 48); com mais vistas vivas a área cresce com elas (o lado, com a raiz), até o teto `ceiling` (o do perfil) e até
 * o maior lado cujo buffer — as tabelas das `views` faixas e as páginas — cabe numa ligação de storage do adaptador
 * (`maxBindingSize`, bytes). O reservatório é comum: o que uma vista não pede fica para as outras.
 */
export function shadowAtlasPagesFor(o: {
    readonly pagesPerLevel: number;
    readonly liveViews: number;
    readonly views: number;
    readonly ceiling: number;
    readonly maxBindingSize: number;
}): number {
    const one = shadowAtlasPages(o.pagesPerLevel);
    const wanted = Math.min(o.ceiling, Math.ceil(one * Math.sqrt(Math.max(1, o.liveViews))));
    const tables = o.views * shadowTableWords(o.pagesPerLevel);
    const fit = Math.floor(
        Math.sqrt(Math.max(0, o.maxBindingSize / 4 - tables) / SHADOW_PAGE_WORDS),
    );
    return Math.max(1, Math.min(wanted, fit));
}

/** Opções do `ShadowAtlas`. */
export interface ShadowAtlasOptions {
    /** Faixas: vistas de sombra no máximo (1 a `SHADOW_MAX_VIEWS`). Padrão `SHADOW_MAX_VIEWS`. */
    readonly views?: number;
    /** Teto das páginas físicas por lado (1 a `SHADOW_ATLAS_PAGES_MAX`). Padrão `SHADOW_ATLAS_PAGES_MAX`. */
    readonly atlasPagesMax?: number;
    /** O `maxStorageBufferBindingSize` do adaptador (bytes). Padrão: o mínimo do WebGPU. */
    readonly maxBindingSize?: number;
    /** Páginas desenhadas por quadro entre as vistas cujo cache segue. Padrão `SHADOW_PAGE_BUDGET`. */
    readonly budget?: number;
}

/** Dado do `ShadowAtlas` (layout de `ShadowAtlas.schema`). */
export interface ShadowAtlasData {
    /** Faixas (vistas no máximo). */
    views: number;
    /** Páginas por lado de um nível na faixa. */
    pagesPerLevel: number;
    /** Páginas físicas por lado. */
    atlasPages: number;
    /** Vistas vivas. */
    live: number;
    /** Palavras da tabela de uma vista. */
    stripTableWords: number;
    /** Palavras dos pedidos de uma vista. */
    stripRequestWords: number;
    /** Primeira palavra das páginas físicas. */
    pagesBase: number;
    /** Páginas desenhadas por quadro entre as vistas cujo cache segue. */
    budget: number;
}

/**
 * O atlas único dos mapas de sombra virtuais da cena (Camada 3; spec 013, R2): as páginas físicas, as tabelas de
 * páginas e os pedidos de todas as vistas de sombra num buffer só. Cada vista (um referencial: a de uma luz direcional;
 * depois, a de uma luz de foco e as seis faces de uma pontual) tem uma faixa da tabela e uma dos pedidos; as páginas
 * físicas são um reservatório comum, repartido pelo que cada vista pede. Um por cena: entra com a primeira luz com
 * sombra por páginas e sai com a última, por evento (`shadowViewsByEvent`).
 *
 * `atlas`: as tabelas (uma faixa por vista, 4 palavras por página virtual, refeitas no lugar a cada quadro) e depois as
 * páginas físicas (`SHADOW_PAGE_WORDS` profundidades cada), série por páginas da spec 037 (o alvo só, com o carimbo de
 * cada página física e a época da C2). `requests`: os pedidos (uma faixa por vista, 2 palavras por página virtual),
 * série de duas fatias. `params`: as faixas e o reservatório, lidos pelo estágio do referencial.
 *
 * As vistas vivas ficam na ordem de entrada, cada uma na faixa livre de menor índice; a que sai libera a faixa (as
 * páginas dela voltam ao reservatório no quadro seguinte: nenhuma tabela viva as segura). O mapa recebe a sua vista
 * (`ShadowMap.data.view`).
 */
export class ShadowAtlas extends Entity<ShadowAtlasData> implements Resource {
    /** As faixas e o reservatório (uniform). */
    static readonly schema = new StructSchema(
        'ShadowAtlas',
        {
            views: FieldType.u32,
            pagesPerLevel: FieldType.u32,
            atlasPages: FieldType.u32,
            live: FieldType.u32,
            stripTableWords: FieldType.u32,
            stripRequestWords: FieldType.u32,
            pagesBase: FieldType.u32,
            budget: FieldType.u32,
        },
        { addressSpace: 'uniform' },
    );

    state: ResourceState = ResourceState.Uninitialized;

    private readonly ceiling: number;
    private readonly maxBindingSize: number;
    /** O mapa de cada faixa (`undefined`: livre). */
    private readonly placed: (ShadowMap | undefined)[];
    /** Quantas vezes cada faixa mudou de dono ou de lugar no buffer (o cache dela recomeça). */
    private readonly generations: number[];

    constructor(options: ShadowAtlasOptions = {}) {
        super();
        const views = options.views ?? SHADOW_MAX_VIEWS;
        if (!(Number.isInteger(views) && views >= 1 && views <= SHADOW_MAX_VIEWS))
            throw new RangeError(`ShadowAtlas: views ${views} fora de 1–${SHADOW_MAX_VIEWS}.`);
        const ceiling = options.atlasPagesMax ?? SHADOW_ATLAS_PAGES_MAX;
        if (!(Number.isInteger(ceiling) && ceiling >= 1 && ceiling <= SHADOW_ATLAS_PAGES_MAX))
            throw new RangeError(
                `ShadowAtlas: atlasPagesMax ${ceiling} fora de 1–${SHADOW_ATLAS_PAGES_MAX}.`,
            );
        const budget = options.budget ?? SHADOW_PAGE_BUDGET;
        if (!(Number.isInteger(budget) && budget >= 1))
            throw new RangeError(`ShadowAtlas: budget ${budget} precisa ser um inteiro positivo.`);
        this.ceiling = ceiling;
        this.maxBindingSize = options.maxBindingSize ?? BINDING_SIZE_FLOOR;
        this.placed = Array.from({ length: views }, () => undefined);
        this.generations = Array.from({ length: views }, () => 0);
        this.data = { ...this.shape(views, 4, 0), budget };
    }

    /** O mapa de cada faixa, pelo índice da vista (`undefined`: faixa livre). */
    get views(): readonly (ShadowMap | undefined)[] {
        return this.placed;
    }

    /** Geração da faixa `view`: muda quando ela ganha outro dono ou o atlas é refeito — o cache dela recomeça. */
    generationOf(view: number): number {
        return this.generations[view] ?? 0;
    }

    /**
     * Põe o mapa nas vistas vivas, na faixa livre de menor índice, e lhe dá a vista. Devolve `false` sem faixa livre (o
     * mapa fica sem vista: a luz dele não tem sombra).
     */
    assign(map: ShadowMap): boolean {
        if (this.placed.includes(map)) return true;
        const view = this.placed.indexOf(undefined);
        if (view < 0) return false;
        this.placed[view] = map;
        this.generations[view] = this.generationOf(view) + 1;
        map.place(this, view);
        this.fit();
        return true;
    }

    /** Tira o mapa das vistas vivas: a faixa fica livre. */
    release(map: ShadowMap): void {
        const view = this.placed.indexOf(map);
        if (view < 0) return;
        this.placed[view] = undefined;
        map.place(undefined, 0);
        this.fit();
    }

    /**
     * Ajusta as faixas (as páginas por nível do maior mapa vivo) e o reservatório (pelas vistas vivas, o teto e o
     * adaptador; com as mesmas faixas, ele não encolhe quando uma vista sai). Mudados, a C2 realoca o atlas e os pedidos,
     * e o cache de todas as vistas recomeça. Chamado na entrada e
     * na saída de uma vista e pelo mapa que muda de tamanho.
     */
    fit(): void {
        const maps = this.placed.filter((m): m is ShadowMap => m !== undefined);
        const now = this.rawData;
        const pagesPerLevel =
            maps.length === 0
                ? now.pagesPerLevel
                : Math.max(...maps.map((m) => m.data.pagesPerLevel));
        const shaped = this.shape(now.views, pagesPerLevel, maps.length);
        // Com as mesmas faixas o reservatório só cresce: a vista que sai não realoca o atlas (o cache das outras segue).
        const keep = pagesPerLevel === now.pagesPerLevel && shaped.atlasPages < now.atlasPages;
        const next = {
            ...(keep ? { ...shaped, atlasPages: now.atlasPages } : shaped),
            budget: now.budget,
        };
        if (next.pagesPerLevel === now.pagesPerLevel && next.atlasPages === now.atlasPages) {
            if (next.live !== now.live) this.data.live = next.live;
            return;
        }
        for (let v = 0; v < this.generations.length; v++)
            this.generations[v] = this.generationOf(v) + 1;
        this.redescribe(this.getDescriptors(), next);
    }

    /** O dado das faixas para `pagesPerLevel` e `live` vistas vivas. */
    private shape(
        views: number,
        pagesPerLevel: number,
        live: number,
    ): Omit<ShadowAtlasData, 'budget'> {
        const atlasPages = shadowAtlasPagesFor({
            pagesPerLevel,
            liveViews: live,
            views,
            ceiling: this.ceiling,
            maxBindingSize: this.maxBindingSize,
        });
        const layout = shadowAtlasLayout(views, pagesPerLevel, atlasPages);
        return {
            views,
            pagesPerLevel,
            atlasPages,
            live,
            stripTableWords: layout.stripTableWords,
            stripRequestWords: layout.stripRequestWords,
            pagesBase: layout.pagesBase,
        };
    }

    /** Os parâmetros (a CPU envia a cada mutação), o atlas (série por páginas) e os pedidos (série de duas fatias). */
    getDescriptors(): readonly GPUDescriptor[] {
        const { views, pagesPerLevel, atlasPages } = this.rawData;
        const layout = shadowAtlasLayout(views, pagesPerLevel, atlasPages);
        return [
            { id: 'params', role: 'uniform', schema: ShadowAtlas.schema },
            {
                id: 'atlas',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: layout.atlasWords,
                upload: 'never',
                // Série por páginas (034, T060a): o alvo só, o tempo guardado por página física (o carimbo e a época da
                // C2); só as páginas sujas são redesenhadas, as demais seguem onde estão. As tabelas, antes delas.
                history: {
                    depth: 1,
                    pages: { record: SHADOW_PAGE_WORDS * 4, offset: layout.pagesBase * 4 },
                },
            },
            {
                id: 'requests',
                role: 'storage-rw',
                schema: GpuWordSchema,
                // Duas palavras por página virtual: a faixa de profundidade dos pontos que a pediram.
                count: layout.requestWords,
                upload: 'never',
                history: { depth: 2 },
            },
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
