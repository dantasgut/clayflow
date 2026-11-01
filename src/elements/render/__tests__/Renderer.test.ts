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
import { ShadowMap } from '../../scene/ShadowMap';

describe('Renderer (spec 039, FR-010)', () => {
    it('padrão: perfil alto com os valores de hoje (16 interfaces, 65 536 fótons, cáusticas ligadas)', () => {
        const r = new Renderer();
        expect(r.profile).toBe('high');
        expect(r.lightPaths.transmission).toBe(16);
        expect(r.lightPaths.refraction).toBe(true);
        expect(r.caustics).toMatchObject({ enabled: true, photons: 65_536, cellSize: 0.01 });
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

    it('perfil alto: a luz global, a névoa e a sombra com os valores de antes (a mesma imagem)', () => {
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
        expect(r.shadows).toMatchObject({ resolution: 1024, penumbraSamples: 9 });
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
        expect(map.data.size).toEqual([512, 512]);
        expect(map.data.penumbraSamples).toBe(4);
        expect(sized.data.size).toEqual([2048, 2048]);
        expect(sized.data.penumbraSamples).toBe(4);

        r.profile = 'high';
        expect(free.data.raysPerProbe).toBe(GI_QUALITY.high.raysPerProbe);
        expect(froxels.grid).toEqual(FROXEL_GRID);
        expect(map.data).toMatchObject({ size: [1024, 1024], penumbraSamples: 9 });

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
        expect(r.shadows).toMatchObject({ resolution: 1024, penumbraSamples: 9 });
        expect(() => new ShadowMap({ penumbraSamples: 2 })).toThrow(RangeError);
    });

    it('na cena: o mapa de sombra e os froxels realocam pela C2 quando o perfil muda o tamanho', () => {
        const world = new World(new DefaultEventBus());
        const r = new Renderer();
        const map = new ShadowMap();
        const froxels = new Froxels();
        world.insert(map);
        world.insert(froxels);
        r.adopt(map);
        r.adopt(froxels);
        r.profile = 'low';
        const depth = map.getDescriptors().find((d) => d.id === 'depth');
        expect(depth?.textureShape).toMatchObject({ width: 512, height: 512 });
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
