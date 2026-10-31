import { describe, expect, it } from 'vitest';
import { RENDER_PROFILES, Renderer } from '../Renderer';
import { Refraction } from '../../lighting/refraction/Refraction';
import { TemporalAntialiasing } from '../../scene/TemporalAntialiasing';
import { TemporalFilter } from '../../lighting/temporal/TemporalFilter';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';

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
        r.profile = 'low';
        expect(r.causticsResource.enabled).toBe(true);
        expect(r.causticsResource.photons).toBe(8_192);
        expect(r.refractionResource.maxInterfaces).toBe(4);
        r.profile = 'high';
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
});
