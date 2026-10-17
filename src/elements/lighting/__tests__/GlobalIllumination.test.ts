import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { registerPresentationDefaults } from '../../../presentation/flows/defaults';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { RayScene } from '../../raytrace/RayScene';
import { Camera } from '../../scene/Camera';
import { DirectionalLight } from '../../scene/DirectionalLight';
import { HemisphereLight } from '../../scene/HemisphereLight';
import { Transform } from '../../scene/Transform';
import { GI_QUALITY, GlobalIllumination } from '../GlobalIllumination';
import { composeHitMaterial, screenTile } from '../ProbeFlow';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { GI_SCREEN_TILE_MIN } from '../schemas';

// Iluminação global (spec 033, T024): validação, qualidades, contribuição, troca do hemisfério por evento e o estágio
// das sondas gravando um passe por quadro.

describe('GlobalIllumination (spec 033, T024)', () => {
    it('valores padrão pela qualidade; validação dos intervalos', () => {
        const gi = new GlobalIllumination();
        expect(gi.data).toMatchObject({
            bounces: 3,
            raysPerProbe: 128,
            probeFraction: 0.25,
            cascades: 3,
        });
        expect(new GlobalIllumination({ quality: 'low' }).data.raysPerProbe).toBe(
            GI_QUALITY.low.raysPerProbe,
        );
        expect(() => new GlobalIllumination({ bounces: 0 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ bounces: 9 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ raysPerProbe: 100 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ probeFraction: 0 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ hysteresis: 0.5 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ cascades: 5 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ screenRays: 3 })).toThrow(RangeError);
        expect(() => new GlobalIllumination({ screenTile: 2 })).toThrow(RangeError);
        gi.quality = 'high';
        expect(gi.data.raysPerProbe).toBe(GI_QUALITY.high.raysPerProbe);
        expect(gi.data).toMatchObject({ screenGather: true, screenRays: 32, screenTile: 4 });
    });

    it('coleta final na tela: o ladrilho dobra a cada dobro da altura (a mesma resolução angular), nunca abaixo do menor', () => {
        expect(screenTile(4, 1080)).toBe(4);
        expect(screenTile(4, 480)).toBe(GI_SCREEN_TILE_MIN);
        expect(screenTile(4, 2160)).toBe(8);
        expect(screenTile(8, 4320)).toBe(32);
    });

    it('composição das funções `material` nos acertos: um caso por função, um único retorno depois do switch', () => {
        // O retorno do fechamento (struct grande) de dentro de cada caso, com invocações em casos diferentes, saía
        // errado no Metal (a emissão do painel sumia nos acertos): os casos atribuem e a função retorna uma vez.
        const fns = [
            'closure_diffuse(m.albedo.rgb, 0.0)',
            'closure_add(closure_diffuse(m.albedo.rgb, 0.0), closure_emission(vec3f(4.0), 1.0))',
        ].map((body) => {
            const f = new MaterialFunction({
                code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return ${body};\n}`,
            });
            return { ...f.composite!, returnsClosure: f.returnsClosure };
        });
        const source = composeHitMaterial(fns).source;
        expect(source.match(/case \d+u:/g)).toHaveLength(2);
        expect(source.match(/\breturn\b/g)).toHaveLength(1);
    });

    it('descritores: parâmetros, estado das sondas (só GPU), três atlas e o amostrador; contribui a scene_lighting', () => {
        const gi = new GlobalIllumination();
        const byId = new Map(gi.getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('params')?.role).toBe('uniform');
        expect(byId.get('probes')).toMatchObject({ role: 'storage-rw', upload: 'never' });
        for (const id of ['irradiance', 'radiance', 'visibility'])
            expect(byId.get(id)).toMatchObject({
                role: 'storage-texture',
                textureShape: { format: 'rgba16float' },
            });
        for (const id of ['screenProbe', 'screenNormal', 'screenIrradiance'])
            expect(byId.get(id)).toMatchObject({
                role: 'storage-texture',
                textureShape: { sizeFromCanvas: true, canvasDivisor: GI_SCREEN_TILE_MIN },
            });
        expect(gi.getSceneContributions().map((c) => c.point.name)).toEqual(['scene_lighting']);
    });

    it('com ela na cena, os estágios padrão retiram o hemisfério e garantem a RayScene; sem ela, o devolvem', async () => {
        const s = await renderScene();
        const defaults = registerPresentationDefaults(s.scene.flows, {
            world: s.scene.world,
            events: s.scene.events,
        });
        const world = s.scene.world;
        const inWorld = (r: object): boolean => world.entityIdOfResource(r as never) !== undefined;
        expect(inWorld(defaults.ambient)).toBe(true);
        const gi = new GlobalIllumination();
        world.insert(gi);
        expect(inWorld(defaults.ambient)).toBe(false);
        expect(world.queryBySchemaName(RayScene.schema.name)).toHaveLength(1);
        world.remove(gi);
        expect(inWorld(defaults.ambient)).toBe(true);
        expect(world.queryBySchemaName(HemisphereLight.schema.name)).toHaveLength(1);
    });

    it('o estágio das sondas grava um passe por quadro (raios, acúmulo, estado e atlas)', async () => {
        const s = await renderScene();
        registerPresentationDefaults(s.scene.flows, {
            world: s.scene.world,
            events: s.scene.events,
        });
        const world = s.scene.world;
        world.insert(new Camera().add(new Transform({ position: [0, 1, 5, 1] })));
        world.insert(new DirectionalLight({ direction: [0, -1, 0, 0] }));
        world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        world.insert(new GlobalIllumination());
        s.step();
        s.step();
        expect(s.computes().filter((c) => c === 'ProbeFlow')).toHaveLength(1);
        expect(s.createdWhileRecording()).toBe(0);
        const gi = world
            .queryBySchemaName(GlobalIllumination.schema.name)
            .flatMap((id) => world.resourcesOf(id))
            .find((r) => r instanceof GlobalIllumination)!;
        // Cascatas centradas na câmera: o canto da mais fina meia grade antes dela.
        expect(gi.data.params[0].cascade0).toEqual([-8, -3, -3, 1]);
        gi.data.enabled = false;
        s.step();
        expect(s.computes().filter((c) => c === 'ProbeFlow')).toHaveLength(0);
    });
});
