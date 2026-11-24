import { describe, expect, it } from 'vitest';
import { RENDER_PROFILES, Renderer } from '../Renderer';
import { Refraction } from '../../lighting/refraction/Refraction';
import { TemporalAntialiasing } from '../../scene/TemporalAntialiasing';
import { TemporalFilter } from '../../lighting/temporal/TemporalFilter';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import { GI_QUALITY, GlobalIllumination } from '../../lighting/GlobalIllumination';
import { Froxels } from '../../media/Froxels';
import { FROXEL_GRID } from '../../media/schemas';
import { SHADOW_MAX_VIEWS, ShadowAtlas } from '../../scene/ShadowAtlas';
import { SHADOW_MAX_LEVELS, ShadowMap, shadowTableWords } from '../../scene/ShadowMap';
import { shadowViewsByEvent } from '../../scene/shadowCaster';
import { DirectionalLight } from '../../scene/DirectionalLight';
import { NONE } from '../../../scene/shaders/engineConstants';

describe('Renderer (spec 039, FR-010)', () => {
    it('padrão: perfil alto com os valores de hoje (16 interfaces, 65 536 fótons, cáusticas ligadas)', () => {
        const r = new Renderer();
        expect(r.profile).toBe('high');
        expect(r.lightPaths.transmission).toBe(16);
        expect(r.lightPaths.refraction).toBe(true);
        expect(r.caustics).toMatchObject({ enabled: true, photons: 65_536, cellSize: 0.005 });
        expect(r.antialiasing.mode).toBe('temporal');
    });

    it('os perfis preenchem os valores; trocar o perfil vale no Resource que os estágios leem', () => {
        const r = new Renderer({ profile: 'medium' });
        expect(r.refractionResource.maxInterfaces).toBe(RENDER_PROFILES.medium.transmission);
        expect(r.causticsResource.photons).toBe(RENDER_PROFILES.medium.photons);
        expect(r.tracing.checkerboard).toBe(true);
        r.profile = 'low';
        expect(r.causticsResource.enabled).toBe(true);
        expect(r.causticsResource.photons).toBe(8_192);
        expect(r.refractionResource.maxInterfaces).toBe(4);
        r.profile = 'high';
        expect(r.tracing.checkerboard).toBe(false);
        expect(r.causticsResource.enabled).toBe(true);
        expect(r.causticsResource.photons).toBe(65_536);
    });

    it('ajustes por cima do perfil; valores inválidos recusados sem mudar o anterior', () => {
        const r = new Renderer();
        r.lightPaths.transmission = 8;
        expect(r.refractionResource.maxInterfaces).toBe(8);
        expect(() => {
            r.lightPaths.transmission = 0;
        }).toThrow(RangeError);
        expect(r.lightPaths.transmission).toBe(8);
        expect(() => {
            r.caustics.photons = -1;
        }).toThrow(RangeError);
        expect(() => {
            r.caustics.cellSize = 0;
        }).toThrow(RangeError);
        expect(() => {
            r.profile = 'ultra' as never;
        }).toThrow(/perfil/);
    });

    it('na cena: uma entidade com o antisserrilhado, o filtro temporal e a refração (as cáusticas entram com o transmissivo)', () => {
        const world = new World(new DefaultEventBus());
        const r = new Renderer();
        const id = world.insert(r);
        const parts = world.resourcesOf(id);
        expect(parts.some((p) => p instanceof TemporalAntialiasing)).toBe(true);
        expect(parts.some((p) => p instanceof TemporalFilter)).toBe(true);
        expect(parts.some((p) => p instanceof Refraction)).toBe(true);
        expect(world.queryBySchemaName('Caustics')).toHaveLength(0);
    });

    it('perfil alto: a luz global e a névoa com os valores de antes (a mesma imagem); a sombra virtual em níveis de 4096²', () => {
        const r = new Renderer();
        expect(r.lightPaths.globalIllumination).toBe(true);
        expect(r.globalIllumination).toMatchObject({
            raysPerProbe: GI_QUALITY.high.raysPerProbe,
            probeFraction: GI_QUALITY.high.probeFraction,
            screenRays: GI_QUALITY.high.screenRays,
            screenTile: GI_QUALITY.high.screenTile,
            screenFraction: GI_QUALITY.high.screenFraction,
        });
        expect(r.fog.resolution).toEqual(FROXEL_GRID);
        expect(r.shadows).toMatchObject({ resolution: 4096, penumbraSamples: 9 });
    });

    it('os recursos adotados seguem o perfil e os ajustes; o que a autoria fixou vale por cima (T079)', () => {
        const r = new Renderer({ profile: 'low' });
        const free = new GlobalIllumination();
        const fixed = new GlobalIllumination({ quality: 'medium' });
        const one = new GlobalIllumination({ screenTile: 16 });
        const froxels = new Froxels();
        const map = new ShadowMap();
        const sized = new ShadowMap({ size: [2048, 2048] });
        for (const x of [free, fixed, one, froxels, map, sized]) r.adopt(x);
        expect(free.data.raysPerProbe).toBe(GI_QUALITY.low.raysPerProbe);
        expect(free.data.probeFraction).toBe(GI_QUALITY.low.probeFraction);
        expect(fixed.data.probeFraction).toBe(GI_QUALITY.medium.probeFraction);
        expect(one.data.screenTile).toBe(16);
        expect(one.data.screenRays).toBe(GI_QUALITY.low.screenRays);
        expect(froxels.grid).toEqual(RENDER_PROFILES.low.froxels);
        expect(map.data.size).toEqual([1024, 1024]);
        expect(map.data.pagesPerLevel).toBe(8);
        expect(map.data.penumbraSamples).toBe(4);
        expect(sized.data.size).toEqual([2048, 2048]);
        expect(sized.data.penumbraSamples).toBe(4);

        r.profile = 'high';
        expect(free.data.raysPerProbe).toBe(GI_QUALITY.high.raysPerProbe);
        expect(froxels.grid).toEqual(FROXEL_GRID);
        expect(map.data).toMatchObject({
            size: [4096, 4096],
            pagesPerLevel: 32,
            penumbraSamples: 9,
        });

        // Ajustes depois do perfil valem por cima dele.
        r.globalIllumination.raysPerProbe = 128;
        r.fog.resolution = [80, 45, 64];
        r.shadows.penumbraSamples = 1;
        expect(free.data.raysPerProbe).toBe(128);
        expect(fixed.data.raysPerProbe).toBe(GI_QUALITY.medium.raysPerProbe);
        expect(froxels.grid).toEqual([80, 45, 64]);
        expect(map.data.penumbraSamples).toBe(1);

        // A luz global nos caminhos de luz: desligada aqui, nenhuma GI roda (o `enabled` da autoria fica como está).
        r.lightPaths.globalIllumination = false;
        expect(free.data.lightPath).toBe(false);
        expect(fixed.data.lightPath).toBe(false);
        expect(fixed.data.enabled).toBe(true);

        // Fora da cena, deixa de seguir.
        r.release(free);
        r.profile = 'medium';
        expect(free.data.raysPerProbe).toBe(128);
        expect(one.data.screenRays).toBe(GI_QUALITY.medium.screenRays);
    });

    it('valores inválidos da luz global, da névoa e da sombra recusados sem mudar o anterior', () => {
        const r = new Renderer();
        expect(() => {
            r.globalIllumination.raysPerProbe = 100;
        }).toThrow(RangeError);
        expect(() => {
            r.globalIllumination.probeFraction = 0;
        }).toThrow(RangeError);
        expect(() => {
            r.fog.resolution = [0, 90, 128];
        }).toThrow(RangeError);
        expect(() => {
            r.shadows.resolution = 1.5;
        }).toThrow(RangeError);
        expect(() => {
            r.shadows.penumbraSamples = 3;
        }).toThrow(RangeError);
        expect(r.globalIllumination.raysPerProbe).toBe(GI_QUALITY.high.raysPerProbe);
        expect(r.fog.resolution).toEqual(FROXEL_GRID);
        expect(r.shadows).toMatchObject({ resolution: 4096, penumbraSamples: 9 });
        expect(() => new ShadowMap({ penumbraSamples: 2 })).toThrow(RangeError);
    });

    it('os tetos das sombras por perfil (spec 013, R9): vistas 16/8/4, luzes de área 4/2/1, páginas 64/32/16', () => {
        expect(RENDER_PROFILES.high.shadows).toEqual({ views: 16, areaLights: 4, atlasPages: 64 });
        expect(RENDER_PROFILES.medium.shadows).toEqual({ views: 8, areaLights: 2, atlasPages: 32 });
        expect(RENDER_PROFILES.low.shadows).toEqual({ views: 4, areaLights: 1, atlasPages: 16 });
        const r = new Renderer();
        expect(r.shadows).toMatchObject({ views: 16, areaLights: 4, atlasPages: 64 });
        r.profile = 'low';
        expect(r.shadows).toMatchObject({ views: 4, areaLights: 1, atlasPages: 16 });
        // Ajustes por cima do perfil; fora da faixa, recusados sem mudar o anterior.
        r.shadows.views = 6;
        r.shadows.areaLights = 0;
        expect(r.shadows).toMatchObject({ views: 6, areaLights: 0 });
        for (const set of [
            () => (r.shadows.views = 0),
            () => (r.shadows.views = 17),
            () => (r.shadows.atlasPages = 65),
            () => (r.shadows.areaLights = -1),
        ])
            expect(set).toThrow(RangeError);
        expect(r.shadows).toMatchObject({ views: 6, areaLights: 0, atlasPages: 16 });
    });

    it('a troca de perfil tira as vistas de sombra além do teto novo, com o evento (spec 013, T022)', () => {
        // Arrange: cinco luzes com sombra no perfil alto, o atlas seguindo o renderizador.
        const events = new DefaultEventBus();
        const world = new World(events);
        const r = new Renderer();
        const unavailable: unknown[] = [];
        events.on('shadowUnavailable', (e) => unavailable.push(e.light));
        events.on('resourcesChanged', (e) => {
            for (const x of e.added) if (x instanceof ShadowAtlas) r.adopt(x);
        });
        shadowViewsByEvent(world, events, () => ({
            views: r.shadows.views,
            atlasPagesMax: r.shadows.atlasPages,
        }));
        const lights = Array.from({ length: 5 }, () => new DirectionalLight({ castShadow: true }));
        for (const light of lights) world.insert(light);
        expect(lights.map((l) => l.shadowMap!.data.view)).toEqual([0, 1, 2, 3, 4]);
        // Act: o perfil baixo tem 4 vistas.
        r.profile = 'low';
        // Assert: a quinta luz, a última a entrar, fica sem sombra e é avisada.
        expect(lights.map((l) => l.shadowMap!.data.view)).toEqual([0, 1, 2, 3, NONE.value]);
        expect(unavailable).toEqual([lights[4]]);
        const atlas = world
            .resourcesOf(world.queryBySchemaName(ShadowAtlas.schema.name)[0]!)
            .find((x): x is ShadowAtlas => x instanceof ShadowAtlas)!;
        expect(atlas.data).toMatchObject({ views: 4, live: 4 });
        expect(atlas.data.atlasPages).toBeLessThanOrEqual(16);
        // De volta ao alto, ela recupera a sombra.
        r.profile = 'high';
        expect(lights[4]!.shadowMap!.data.view).toBe(4);
    });

    it('na cena: o atlas das sombras e os froxels realocam pela C2 quando o perfil muda o tamanho', () => {
        const events = new DefaultEventBus();
        const world = new World(events);
        shadowViewsByEvent(world, events);
        const r = new Renderer();
        // O mapa de uma luz que projeta (a vista dele no atlas vem da luz).
        const light = new DirectionalLight({ castShadow: true });
        const map = light.shadowMap!;
        const froxels = new Froxels();
        world.insert(light);
        world.insert(froxels);
        r.adopt(map);
        r.adopt(froxels);
        r.profile = 'low';
        // O perfil baixo: 8 páginas por nível; as faixas dos pedidos e das tabelas no atlas único acompanham o mapa (no
        // mínimo 16 × 16 páginas físicas).
        const shadows = world
            .resourcesOf(world.queryBySchemaName(ShadowAtlas.schema.name)[0]!)
            .find((x): x is ShadowAtlas => x instanceof ShadowAtlas)!;
        expect(shadows.data).toMatchObject({ pagesPerLevel: 8, atlasPages: 16, live: 1 });
        const requests = shadows.getDescriptors().find((d) => d.id === 'requests');
        // Duas palavras por página: a menor e a maior profundidade de quem pediu; uma faixa por vista.
        expect(requests?.count).toBe(SHADOW_MAX_VIEWS * 8 * 8 * SHADOW_MAX_LEVELS * 2);
        const atlas = shadows.getDescriptors().find((d) => d.id === 'atlas');
        expect(atlas?.history?.pages?.offset).toBe(SHADOW_MAX_VIEWS * shadowTableWords(8) * 4);
        const scatter = froxels.getDescriptors().find((d) => d.id === 'scatter');
        expect(scatter?.textureShape).toMatchObject({
            width: 96,
            height: 54,
            depthOrArrayLayers: 64,
        });
        const ambient = froxels.getDescriptors().find((d) => d.id === 'ambient');
        expect(ambient?.textureShape).toMatchObject({
            width: 24,
            height: 14,
            depthOrArrayLayers: 16,
        });
    });
});
