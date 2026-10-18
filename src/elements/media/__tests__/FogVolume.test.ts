import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { registerPresentationDefaults } from '../../../presentation/flows/defaults';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { rayVolumeTransmittancePoint } from '../../raytrace/points';
import { Camera } from '../../scene/Camera';
import { DirectionalLight } from '../../scene/DirectionalLight';
import { lightTransmissionPoint } from '../../scene/points/lighting';
import { sceneFogPoint } from '../../scene/points/media';
import { Transform } from '../../scene/Transform';
import { DensityFunction } from '../../extension/DensityFunction';
import { FogVolume } from '../FogVolume';
import { Froxels } from '../Froxels';
import { FOG_DENSITY, FOG_SHAPE, FROXEL_GRID } from '../schemas';
import { froxelAmbient, froxelInject, froxelIntegrate, mediaLookup } from '../shaders';

// Névoa volumétrica (spec 033, T055): a validação do `FogVolume` (forma, densidade constante, por função, por grafo ou
// por grade, albedo, anisotropia, emissão), as contribuições dos `Froxels` só com névoa (`scene_fog`,
// `ray_volume_transmittance`, `light_transmission`), os kernels montando e o estágio gravando um passe por quadro sem
// recompilar ao mudar valores.

const NOISE =
    'fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32 { return 0.5 + 0.5 * sin(p.x * data.k + time); }';

describe('FogVolume (spec 033, T055)', () => {
    it('valores: forma, densidade constante, albedo, anisotropia, emissão, borda', () => {
        const fog = new FogVolume({
            shape: { box: [20, 6, 20] },
            center: [0, 3, 0],
            density: 0.05,
            albedo: [0.95, 0.9, 0.8],
            anisotropy: 0.6,
            emission: [0.1, 0, 0],
            edge: 0.5,
        });
        expect(fog.data.shape).toBe(FOG_SHAPE.box);
        expect(fog.data.density).toBe(FOG_DENSITY.constant);
        expect(fog.data.extent).toEqual([10, 3, 10]);
        expect(fog.data.extinction).toBe(0.05);
        expect(fog.getDescriptors()).toEqual([]);
        const sphere = new FogVolume({ shape: { sphere: 2 } });
        expect(sphere.data.shape).toBe(FOG_SHAPE.sphere);
        expect(sphere.data.extent).toEqual([2, 2, 2]);
    });

    it('validação dos intervalos', () => {
        expect(() => new FogVolume({ density: -1 })).toThrow(/extinção/);
        expect(() => new FogVolume({ albedo: [1.2, 0, 0] })).toThrow(/albedo/);
        expect(() => new FogVolume({ anisotropy: 1 })).toThrow(/anisotropia/);
        expect(() => new FogVolume({ emission: [-1, 0, 0] })).toThrow(/emissão/);
        expect(() => new FogVolume({ shape: { sphere: 0 } })).toThrow(/medidas/);
        expect(() => new FogVolume({ edge: -0.1 })).toThrow(/borda/);
        expect(
            () => new FogVolume({ density: { grid: { size: [2, 2, 2], values: [1, 2] } } }),
        ).toThrow(/pede 8 valores/);
    });

    it('densidade por função (código) e por grade: a função anexada, a grade como descritor', () => {
        const fog = new FogVolume({
            density: { code: NOISE, params: { k: 'f32' }, values: { k: 3 } },
            extinction: 0.2,
        });
        expect(fog.data.density).toBe(FOG_DENSITY.function);
        expect(fog.data.extinction).toBe(0.2);
        expect(fog.densityFunction).toBeInstanceOf(DensityFunction);
        expect(fog.densityFunction!.values.k).toBe(3);
        expect(
            () => new DensityFunction({ code: 'fn density_fn(p: vec3f) -> f32 { return 1.0; }' }),
        ).toThrow(/fog_density/);
        const values = Array.from({ length: 27 }, (_, i) => i / 27);
        const grid = new FogVolume({ density: { grid: { size: [3, 3, 3], values } } });
        expect(grid.data.density).toBe(FOG_DENSITY.grid);
        expect(grid.getDescriptors()).toMatchObject([
            { id: 'grid', role: 'storage-rw', count: 27 },
        ]);
    });

    it('Froxels: descritores (grade 160 × 90 × 128) e contribuições só com névoa', () => {
        const froxels = new Froxels();
        const descriptors = froxels.getDescriptors();
        expect(descriptors.map((d) => d.id)).toEqual([
            'params',
            'media',
            'scatter',
            'history0',
            'history1',
            'ambient',
            'sampler',
        ]);
        expect(descriptors[2]!.textureShape).toMatchObject({
            dimension: '3d',
            width: FROXEL_GRID[0],
            height: FROXEL_GRID[1],
            depthOrArrayLayers: FROXEL_GRID[2],
        });
        expect(FROXEL_GRID).toEqual([160, 90, 128]);
        const contributions = froxels.getSceneContributions();
        expect(contributions.map((c) => c.point)).toEqual([
            sceneFogPoint,
            rayVolumeTransmittancePoint,
            lightTransmissionPoint,
        ]);
        expect(contributions.map((c) => c.build(() => undefined))).toEqual([
            undefined,
            undefined,
            undefined,
        ]);
        froxels.setActive(true);
        const modules = contributions.map((c) => c.build(() => undefined)!);
        expect(composeWgsl(modules[0]!).spec.source).toContain('fn scene_fog(p: vec3f) -> vec4f');
        expect(composeWgsl(modules[1]!).spec.source).toContain(
            'fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f',
        );
        expect(composeWgsl(modules[2]!).spec.source).toContain(
            'fn light_transmission(light: u32, p: vec3f) -> vec3f',
        );
        // Com uma função de densidade: a composição troca a pronta pelo `switch`.
        const fn = new DensityFunction({ code: NOISE, params: { k: 'f32' } });
        froxels.setDensityFunctions([fn.composite!]);
        const withFn = composeWgsl(contributions[1]!.build(() => undefined)!).spec.source;
        expect(withFn).toContain(`case 1u: { return ${fn.composite!.functionName}(`);
    });

    it('kernels: injeção (as duas paridades), integração e a leitura montam', () => {
        for (const m of [froxelAmbient, ...froxelInject, ...froxelIntegrate, mediaLookup]) {
            expect(() => composeWgsl(m)).not.toThrow();
        }
        const inject = composeWgsl(froxelInject[0]).spec.source;
        expect(inject).toContain('fn froxel_inject_main(');
        expect(inject).toContain('light_visibility(l, p, 1.0)');
        // A luz ambiente vem da grade grossa (o kernel dela consulta `scene_ambient`).
        expect(inject).toContain('textureSampleLevel(froxel_ambient');
        expect(composeWgsl(froxelAmbient).spec.source).toContain('scene_ambient(p)');
    });

    it('o estágio: um passe por quadro com névoa, sem recompilar ao mudar valores; sem névoa, nada', async () => {
        const s = await renderScene();
        registerPresentationDefaults(s.scene.flows, {
            world: s.scene.world,
            events: s.scene.events,
        });
        const world = s.scene.world;
        world.insert(new Camera().add(new Transform({ position: [0, 1, 5, 1] })));
        world.insert(new DirectionalLight({ direction: [0, -1, 0, 0] }));
        world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.step();
        expect(s.computes().filter((c) => c === 'FroxelFlow')).toHaveLength(0);
        const fog = new FogVolume({ density: 0.1 });
        world.insert(fog);
        s.step();
        s.step();
        expect(s.computes().filter((c) => c === 'FroxelFlow')).toHaveLength(1);
        const froxels = world.findResource(Froxels.schema, Froxels)!;
        expect(froxels.data.active).toBe(1);
        const revision = froxels.data.revision;
        fog.data.extinction = 0.3;
        fog.data.albedo = [0.5, 0.5, 0.5];
        s.step();
        expect(froxels.data.revision).toBe(revision);
        expect(s.core.readback).not.toHaveBeenCalled();
        world.remove(fog);
        s.step();
        expect(s.computes().filter((c) => c === 'FroxelFlow')).toHaveLength(0);
        expect(froxels.data.active).toBe(0);
    });
});
