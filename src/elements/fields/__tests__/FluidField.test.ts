import { describe, expect, it } from 'vitest';
import { FluidBody } from '../../physics/bodies/FluidBody';
import { PointSpriteMaterial } from '../../material/PointSpriteMaterial';
import { ParticlePhysics } from '../../physics/ParticlePhysics';
import { Camera } from '../../scene/Camera';
import { Transform } from '../../scene/Transform';
import { SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import {
    registerStages,
    renderScene,
    waterMaterial,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';
import {
    rayVolumeSurfacePoint,
    rayVolumeHitPoint,
    rayVolumeTransmittancePoint,
} from '../../raytrace/points';
import { FIELD_HEADER_WORDS, FluidField, fieldDataLayout, fieldFilmOffset } from '../FluidField';
import { sceneWetnessPoint } from '../../scene/points/media';
import { FIELD_BRICK, FIELD_BRICK_APRON_VOXELS, FIELD_FILM_CELLS } from '../schemas';
import { FIELD } from '../reference/field';
import { fieldSort } from '../shaders';

// Campo dos fluidos (spec 033, T042): o recurso (descritores, capacidades que crescem, o buffer único das consultas) e
// a contribuição aos raios (só com fluido), e o estágio criando o campo para os corpos de fluido com a aparência pelo
// grafo sem mudança de autoria — blocos de 8³ voxels de ½ espaçamento, construído a cada quadro, nada lido de volta.

const line = (n: number, s = 0.05): number[] =>
    Array.from({ length: n }, (_, i) => [i * s, 0.3, 0]).flat();

describe('FluidField (spec 033, R11)', () => {
    it('descritores: parâmetros, o buffer das consultas pela capacidade e a contagem SetCount', () => {
        const field = new FluidField();
        const [params, data, counts] = field.getDescriptors();
        expect(params).toMatchObject({ id: 'params', role: 'uniform' });
        const layout = fieldDataLayout(field.capacity);
        expect(layout.table).toBe(FIELD_HEADER_WORDS);
        expect(layout.bricks).toBe(
            FIELD_HEADER_WORDS + 2 * field.capacity.table + field.capacity.table / 4,
        );
        expect(layout.voxels).toBe(layout.bricks + 4 * field.capacity.bricks);
        expect(data).toMatchObject({
            id: 'data',
            role: 'storage-rw',
            upload: 'never',
            // Depois dos voxels com a borda, a película de água nos sólidos (spec 034): 6 palavras por célula (a chave,
            // a água livre, a normal, a marca de submersa, a água absorvida e a superfície).
            count:
                layout.voxels
                + field.capacity.bricks * FIELD_BRICK_APRON_VOXELS
                + 6 * FIELD_FILM_CELLS,
        });
        expect(fieldFilmOffset(field.capacity)).toBe(
            layout.voxels + field.capacity.bricks * FIELD_BRICK_APRON_VOXELS,
        );
        expect(counts).toMatchObject({
            id: 'counts',
            role: 'indirect',
            schema: SetCountSchema,
            count: 1,
        });
        // Blocos de 8³ voxels, voxel de ½ espaçamento (os voxels com 2 de borda de cada lado: 12³).
        expect(FIELD_BRICK).toBe(8);
        expect(FIELD.voxel).toBe(0.5);
        expect(FIELD_BRICK_APRON_VOXELS).toBe(12 ** 3);
    });

    it('cópia ordenada: as posições além das vivas da grade viram mortas (a grade deixa as mortas de fora)', () => {
        const source = composeWgsl(fieldSort).spec.source;
        expect(source).toContain(
            'let live = cell_start[grid.table_mask] + cell_count[grid.table_mask];',
        );
        expect(source).toContain('field_sorted[t] = vec4f(0.0, 0.0, 0.0, -1.0);');
    });

    it('reserve: as capacidades crescem em potências de dois e o buffer acompanha', () => {
        const field = new FluidField();
        expect(field.reserve({ bricks: 10, table: 40 })).toBe(false);
        expect(field.reserve({ bricks: 100, table: 400 })).toBe(true);
        expect(field.capacity).toEqual({ bricks: 128, table: 512 });
        const data = field.getDescriptors()[1]!;
        expect(data.count).toBe(
            fieldDataLayout({ bricks: 128, table: 512 }).voxels
                + 128 * FIELD_BRICK_APRON_VOXELS
                + 6 * FIELD_FILM_CELLS,
        );
        expect(field.reserve({ bricks: 128, table: 512 })).toBe(false);
    });

    it('contribuição aos raios e à película só com fluido: ray_volume_hit, ray_volume_surface, ray_volume_transmittance e scene_wetness', () => {
        const field = new FluidField();
        const contributions = field.getSceneContributions();
        expect(contributions.map((c) => c.point)).toEqual([
            rayVolumeHitPoint,
            rayVolumeSurfacePoint,
            rayVolumeTransmittancePoint,
            sceneWetnessPoint,
        ]);
        // A mesma ordem nos três: o `source` do acerto é a posição do contribuinte no ponto.
        expect(new Set(contributions.map((c) => c.order)).size).toBe(1);
        const slotOf = (): undefined => undefined;
        expect(contributions.map((c) => c.build(slotOf))).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
        ]);
        field.setVolume(true);
        const modules = contributions.map((c) => c.build(slotOf)!);
        expect(modules.every((m) => m !== undefined)).toBe(true);
        const hit = composeWgsl(modules[0]!).spec.source;
        expect(hit).toContain(
            'fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32, side: i32) -> RayVolumeHit',
        );
        expect(hit).toContain('field_march(');
        // O material: o índice da função `material` do corpo e o slot dos parâmetros.
        const graph = composeWgsl(modules[1]!).spec.source;
        expect(graph).toContain('fn ray_volume_surface(hit: RayVolumeHit) -> RayVolumeSurface');
        expect(graph).toContain('RayVolumeSurface(body.x, body.y, closure_zero())');
        expect(graph).not.toContain('field_materials');
        // Sem avaliar a função: quem traça a avalia junto com a das malhas (uma expansão de `ray_hit_material`).
        expect(graph).not.toContain('ray_hit_material(');
        const transmittance = composeWgsl(modules[2]!).spec.source;
        expect(transmittance).toContain(
            'fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f',
        );
        expect(transmittance).toContain(
            'closure_absorption(ray_volume_surface_closure(at, field_surface(at), time))',
        );
        expect(transmittance).not.toContain('field_materials');
        // Cada símbolo uma vez.
        expect(transmittance.match(/fn field_surface\(/g)).toHaveLength(1);
        // A água nos sólidos: a película livre e a saturação dos poros no ponto da superfície (spec 034).
        const wetness = composeWgsl(modules[3]!).spec.source;
        expect(wetness).toContain('fn scene_wetness(p: vec3f, n: vec3f) -> vec2f');
        expect(wetness).toContain('return field_film_at(p, n);');
        field.setVolume(false);
        expect(contributions.map((c) => c.build(slotOf))).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
        ]);
    });
});

describe('FluidFieldFlow (spec 033, R11)', () => {
    async function scene() {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene', particles: true, water: true });
        s.scene.world.insert(new Camera().add(new Transform()));
        s.scene.world.insert(new ParticlePhysics({ particleSpacing: 0.05 }));
        return s;
    }

    const fieldOf = (s: Awaited<ReturnType<typeof scene>>): FluidField =>
        s.scene.world.findResource(FluidField.schema, FluidField)!;

    it('sem corpo de fluido com a aparência pelo grafo: nada construído, sem contribuição aos raios', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(20) }).add(new PointSpriteMaterial()),
        );
        s.step();
        s.step();
        expect(s.computes().filter((c) => c.startsWith('FluidFieldFlow'))).toEqual([]);
        expect(fieldOf(s).data.volume).toBe(0);
    });

    it('com o material da água: o campo a cada quadro (junção, grade, núcleos, marcação, densidade, distância, borda), sem leitura de volta', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(300) }).add(waterMaterial()),
        );
        s.step();
        for (let frame = 0; frame < 2; frame++) {
            s.step();
            const computes = s.computes();
            const order = [
                'FluidFieldFlow.gather',
                'FluidFieldFlow.grid.count',
                'FluidFieldFlow.kernels',
                'FluidFieldFlow.mark',
                'FluidFieldFlow.density',
                'FluidFieldFlow.smooth',
                'FluidFieldFlow.init',
                'FluidFieldFlow.redistance',
                'FluidFieldFlow.apron',
            ];
            expect(order.every((c) => computes.includes(c))).toBe(true);
            expect(order.map((c) => computes.indexOf(c))).toEqual(
                [...order.map((c) => computes.indexOf(c))].sort((a, b) => a - b),
            );
        }
        const field = fieldOf(s);
        expect(field.data.volume).toBe(1);
        // A capacidade de blocos acompanha as partículas (8 por bloco no mínimo de 64).
        expect(field.capacity.bricks).toBeGreaterThanOrEqual(64);
        expect(s.core.readback).not.toHaveBeenCalled();
    });

    it('o corpo sai: o campo para e a contribuição aos raios desliga', async () => {
        const s = await scene();
        const body = new FluidBody({ algorithm: 'SPH', position: line(50) }).add(waterMaterial());
        s.scene.world.insert(body);
        s.step();
        s.step();
        expect(fieldOf(s).data.volume).toBe(1);
        s.scene.world.remove(body);
        s.step();
        s.step();
        expect(s.computes().filter((c) => c.startsWith('FluidFieldFlow'))).toEqual([]);
        expect(fieldOf(s).data.volume).toBe(0);
    });
});
