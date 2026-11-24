import { describe, expect, it } from 'vitest';
import { NONE } from '../../../scene/shaders/engineConstants';
import { GpuWordSchema } from '../../gpu/compute/schemas';
import {
    SHADOW_MAX_VIEWS,
    ShadowAtlas,
    shadowAtlasLayout,
    shadowAtlasPagesFor,
    shadowViewBases,
} from '../ShadowAtlas';
import {
    POINT_SHADOW_VIEWS,
    SHADOW_MAX_LEVELS,
    SHADOW_PAGE_WORDS,
    ShadowMap,
    SPOT_SHADOW_VIEWS,
} from '../ShadowMap';

describe('ShadowAtlas — as faixas das vistas', () => {
    it('cada vista tem a sua faixa da tabela (4 palavras por página virtual) e dos pedidos (2), a partir de v · faixa', () => {
        // Arrange
        const layout = shadowAtlasLayout(SHADOW_MAX_VIEWS, 32, 32);
        const entries = SHADOW_MAX_LEVELS * 32 * 32;
        // Act
        const bases = Array.from({ length: SHADOW_MAX_VIEWS }, (_, v) =>
            shadowViewBases(layout, v),
        );
        // Assert
        expect(layout.stripTableWords).toBe(entries * 4);
        expect(layout.stripRequestWords).toBe(entries * 2);
        bases.forEach((b, v) => {
            expect(b.tableBase).toBe(v * entries * 4);
            expect(b.requestBase).toBe(v * entries * 2);
        });
    });

    it('as faixas não se sobrepõem e as páginas físicas começam depois da última tabela', () => {
        const layout = shadowAtlasLayout(8, 16, 24);
        const bases = Array.from({ length: 8 }, (_, v) => shadowViewBases(layout, v));
        for (let v = 1; v < 8; v++) {
            expect(bases[v]!.tableBase).toBe(bases[v - 1]!.tableBase + layout.stripTableWords);
            expect(bases[v]!.requestBase).toBe(
                bases[v - 1]!.requestBase + layout.stripRequestWords,
            );
        }
        expect(layout.pagesBase).toBe(bases[7]!.tableBase + layout.stripTableWords);
        expect(layout.atlasWords).toBe(layout.pagesBase + 24 * 24 * SHADOW_PAGE_WORDS);
        expect(layout.requestWords).toBe(8 * layout.stripRequestWords);
        expect(() => shadowViewBases(layout, 8)).toThrow(RangeError);
    });

    it('as páginas físicas: uma vista como antes; mais vistas, mais páginas, até o teto do perfil', () => {
        const pages = (pagesPerLevel: number, liveViews: number, ceiling = 48): number =>
            shadowAtlasPagesFor({
                pagesPerLevel,
                liveViews,
                views: SHADOW_MAX_VIEWS,
                ceiling,
                maxBindingSize: 2 ** 32,
            });
        // Uma vista: as de um nível, no mínimo 16 e no máximo 48 por lado (o atlas de antes da 013).
        expect(pages(32, 1)).toBe(32);
        expect(pages(4, 1)).toBe(16);
        expect(pages(64, 1)).toBe(48);
        // A área cresce com o número de vistas vivas (o lado, com a raiz), até o teto.
        expect(pages(16, 2)).toBe(23);
        expect(pages(16, 4)).toBe(32);
        expect(pages(32, 4)).toBe(48);
        expect(pages(32, 16)).toBe(48);
        // O teto do perfil.
        expect(pages(32, 4, 32)).toBe(32);
        expect(pages(32, 1, 16)).toBe(16);
        // Sem vista viva, o de uma.
        expect(pages(32, 0)).toBe(32);
    });

    it('o teto pelo limite do adaptador: o maior lado cujo buffer (tabelas + páginas) cabe na ligação', () => {
        const limit = 134_217_728;
        const pages = shadowAtlasPagesFor({
            pagesPerLevel: 32,
            liveViews: 4,
            views: SHADOW_MAX_VIEWS,
            ceiling: 48,
            maxBindingSize: limit,
        });
        const bytes = (a: number): number =>
            shadowAtlasLayout(SHADOW_MAX_VIEWS, 32, a).atlasWords * 4;
        expect(pages).toBe(43);
        expect(bytes(pages)).toBeLessThanOrEqual(limit);
        expect(bytes(pages + 1)).toBeGreaterThan(limit);
        // Com uma vista o atlas de 32 × 32 cabe: o limite não muda nada.
        expect(
            shadowAtlasPagesFor({
                pagesPerLevel: 32,
                liveViews: 1,
                views: SHADOW_MAX_VIEWS,
                ceiling: 48,
                maxBindingSize: limit,
            }),
        ).toBe(32);
    });
});

describe('ShadowAtlas — o Resource', () => {
    it('descritores: os parâmetros, o atlas (tabelas por faixa + páginas, série por páginas) e os pedidos (duas fatias)', () => {
        // Arrange
        const atlas = new ShadowAtlas({ views: 4 });
        const map = new ShadowMap({ size: [512, 256] });
        // Act
        atlas.assign(map);
        const layout = shadowAtlasLayout(4, 4, 16);
        // Assert
        expect(atlas.data).toMatchObject({ views: 4, pagesPerLevel: 4, atlasPages: 16, live: 1 });
        expect(atlas.getDescriptors()).toEqual([
            { id: 'params', role: 'uniform', schema: ShadowAtlas.schema },
            {
                id: 'atlas',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: layout.atlasWords,
                upload: 'never',
                history: {
                    depth: 1,
                    pages: { record: SHADOW_PAGE_WORDS * 4, offset: layout.pagesBase * 4 },
                },
            },
            {
                id: 'requests',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: layout.requestWords,
                upload: 'never',
                history: { depth: 2 },
            },
        ]);
    });

    it('as vistas na ordem de entrada, cada mapa com a sua; a que sai libera a faixa para a próxima', () => {
        const atlas = new ShadowAtlas({ views: 3 });
        const [a, b, c, d] = [new ShadowMap(), new ShadowMap(), new ShadowMap(), new ShadowMap()];
        expect(a.data.view).toBe(NONE.value);
        expect(atlas.assign(a)).toBe(true);
        expect(atlas.assign(b)).toBe(true);
        expect(atlas.assign(c)).toBe(true);
        expect([a, b, c].map((m) => m.data.view)).toEqual([0, 1, 2]);
        expect(atlas.views).toEqual([a, b, c]);
        // Acima do teto de vistas, o mapa fica sem vista.
        expect(atlas.assign(d)).toBe(false);
        expect(d.data.view).toBe(NONE.value);
        // A que sai libera a faixa; as outras ficam onde estão.
        atlas.release(b);
        expect(b.data.view).toBe(NONE.value);
        expect(atlas.views).toEqual([a, undefined, c]);
        expect(atlas.data.live).toBe(2);
        expect(atlas.assign(d)).toBe(true);
        expect(d.data.view).toBe(1);
        expect([a, c].map((m) => m.data.view)).toEqual([0, 2]);
        // A faixa reusada muda de geração (o cache dela recomeça); as demais não.
        expect(atlas.generationOf(1)).toBeGreaterThan(atlas.generationOf(0));
    });

    it('o mapa de várias vistas (a pontual: seis) ocupa faixas seguidas; espalhadas, as vistas vivas são reagrupadas', () => {
        // Arrange: oito faixas; uma de foco, uma pontual e outra de foco.
        const atlas = new ShadowAtlas({ views: 8 });
        const spotA = new ShadowMap({}, SPOT_SHADOW_VIEWS);
        const point = new ShadowMap({}, POINT_SHADOW_VIEWS);
        const spotB = new ShadowMap({}, SPOT_SHADOW_VIEWS);
        // Act + Assert: a pontual fica com as seis faixas a partir da 1; a outra de foco, com a 7.
        expect(atlas.assign(spotA)).toBe(true);
        expect(atlas.assign(point)).toBe(true);
        expect(atlas.assign(spotB)).toBe(true);
        expect([spotA, point, spotB].map((m) => m.data.view)).toEqual([0, 1, 7]);
        expect(atlas.views).toEqual([spotA, point, point, point, point, point, point, spotB]);
        expect(atlas.data.live).toBe(8);
        // Sem faixa livre, nada entra.
        const extra = new ShadowMap({}, SPOT_SHADOW_VIEWS);
        expect(atlas.assign(extra)).toBe(false);
        // A pontual sai: as seis ficam livres; as de foco não se movem.
        atlas.release(point);
        expect(atlas.views).toEqual([spotA, ...Array.from({ length: 6 }, () => undefined), spotB]);
        expect(atlas.data.live).toBe(2);
        // Três de foco entram nas livres; a que sai do meio deixa as livres espalhadas (2 e 5–6 não: 4 livres ao todo,
        // nenhum trecho de seis) — uma pontual não cabe; cabe depois de sair mais gente, com as vivas reagrupadas.
        const spots = Array.from({ length: 3 }, () => new ShadowMap({}, SPOT_SHADOW_VIEWS));
        for (const m of spots) atlas.assign(m);
        expect(spots.map((m) => m.data.view)).toEqual([1, 2, 3]);
        expect(atlas.assign(point)).toBe(false);
        atlas.release(spots[0]!);
        atlas.release(spots[1]!);
        atlas.release(spotA);
        // Livres: 0, 1, 2, 4, 5, 6 — seis, em dois trechos. A pontual entra com as vivas juntas no começo.
        const moved = atlas.generationOf(1);
        expect(atlas.assign(point)).toBe(true);
        expect([spots[2]!, spotB, point].map((m) => m.data.view)).toEqual([0, 1, 2]);
        expect(atlas.views).toEqual([spots[2], spotB, point, point, point, point, point, point]);
        // As faixas que mudaram de dono mudaram de geração (o cache delas recomeça).
        expect(atlas.generationOf(1)).toBeGreaterThan(moved);
    });

    it('o reservatório cresce com os mapas vivos, não com as vistas: as seis faces da pontual repartem o de um mapa', () => {
        const atlas = new ShadowAtlas({ maxBindingSize: 2 ** 32 });
        atlas.assign(new ShadowMap({}, POINT_SHADOW_VIEWS));
        expect(atlas.data).toMatchObject({ pagesPerLevel: 32, atlasPages: 32, live: 6 });
        atlas.assign(new ShadowMap({}, SPOT_SHADOW_VIEWS));
        expect(atlas.data).toMatchObject({ atlasPages: 46, live: 7 });
    });

    it('a faixa tem as páginas por nível do maior mapa vivo, e as páginas físicas seguem as vistas vivas', () => {
        const atlas = new ShadowAtlas({ maxBindingSize: 2 ** 32 });
        // O tamanho pelo perfil do renderizador (o que a autoria fixa não muda com ele).
        const small = new ShadowMap();
        small.fromRenderer(1024, 9);
        const large = new ShadowMap({ size: [4096, 4096] });
        atlas.assign(small);
        expect(atlas.data).toMatchObject({ pagesPerLevel: 8, atlasPages: 16, live: 1 });
        atlas.assign(large);
        expect(atlas.data).toMatchObject({ pagesPerLevel: 32, atlasPages: 46, live: 2 });
        atlas.release(large);
        expect(atlas.data).toMatchObject({ pagesPerLevel: 8, atlasPages: 16, live: 1 });
        // O mapa que muda de tamanho (o perfil do renderizador) leva o atlas junto.
        small.fromRenderer(2048, 4);
        expect(atlas.data).toMatchObject({ pagesPerLevel: 16, atlasPages: 16 });
    });
});
