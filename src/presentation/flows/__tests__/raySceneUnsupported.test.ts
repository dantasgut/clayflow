import { describe, expect, it } from 'vitest';
import { renderScene } from './helpers/renderHarness';
import { registerPresentationDefaults } from '../defaults';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Transform } from '../../../elements/scene/Transform';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';
import { GlobalIllumination } from '../../../elements/lighting/GlobalIllumination';

// A estrutura de raios que não coube no dispositivo (spec 034, T046): o estágio padrão avisa a refração e a luz global
// da cena, uma vez cada, também para o que entra depois do aviso.

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));
}`;

const REASON = 'estrutura de raios acima do limite de binding do dispositivo (1024 bytes)';

async function scene() {
    const s = await renderScene();
    const defaults = registerPresentationDefaults(s.scene.flows, {
        world: s.scene.world,
        events: s.scene.events,
    });
    const refraction: string[] = [];
    const gi: string[] = [];
    s.scene.events.on('refractionUnsupported', (e) => refraction.push(e.reason));
    s.scene.events.on('globalIlluminationUnsupported', (e) => gi.push(e.reason));
    const glass = (): void => {
        s.scene.world.insert(
            new SphereGeometry()
                .add(new StandardMaterial())
                .add(new Transform())
                .add(new MaterialFunction({ code: GLASS, lobes: ['specular', 'transmission'] })),
        );
    };
    const unsupported = (): void => {
        s.scene.events.emit('raySceneUnsupported', { reason: REASON });
    };
    return { s, defaults, refraction, gi, glass, unsupported };
}

describe('estrutura de raios sem suporte (spec 034, T046)', () => {
    it('com um transmissivo na cena: a refração avisa uma vez, com o motivo; sem GI, a luz global não avisa', async () => {
        const { refraction, gi, glass, unsupported } = await scene();
        glass();
        unsupported();
        unsupported();
        glass();
        expect(refraction).toEqual([REASON]);
        expect(gi).toEqual([]);
    });

    it('o transmissivo que entra depois do aviso da estrutura também avisa', async () => {
        const { refraction, glass, unsupported } = await scene();
        unsupported();
        expect(refraction).toEqual([]);
        glass();
        expect(refraction).toEqual([REASON]);
    });

    it('com a refração desligada no renderizador: nenhum aviso dela', async () => {
        const { defaults, refraction, glass, unsupported } = await scene();
        defaults.renderer.lightPaths.refraction = false;
        glass();
        unsupported();
        expect(refraction).toEqual([]);
    });

    it('a luz global na cena avisa uma vez; sem a estrutura sem suporte, nenhum aviso', async () => {
        const { s, refraction, gi, unsupported } = await scene();
        s.scene.world.insert(new GlobalIllumination({ quality: 'low' }));
        expect(gi).toEqual([]);
        unsupported();
        s.scene.world.insert(new GlobalIllumination({ quality: 'low' }));
        expect(gi).toEqual([REASON]);
        expect(refraction).toEqual([]);
    });
});
