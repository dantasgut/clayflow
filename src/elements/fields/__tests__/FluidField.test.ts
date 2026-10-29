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
    rayVolumeBoundsPoint,
    rayVolumeHitPoint,
    rayVolumeOccupiedPoint,
    rayVolumeTransmittancePoint,
} from '../../raytrace/points';
import { FIELD_HEADER_WORDS, FluidField, fieldDataLayout, fieldFilmOffset } from '../FluidField';
import { sceneWetnessPoint } from '../../scene/points/media';
import { lightTransmissionPoint } from '../../scene/points/lighting';
import {
    FIELD_BRICK,
    FIELD_BRICK_APRON_VOXELS,
    FIELD_FILM_CELLS,
    FIELD_MAX_BODIES,
    FIELD_MEDIUM_WORDS,
} from '../schemas';
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
            // a água livre, a normal, a marca de submersa, a água absorvida e a superfície); depois, o meio de cada
            // corpo (spec 039).
            count:
                layout.voxels
                + field.capacity.bricks * FIELD_BRICK_APRON_VOXELS
                + 6 * FIELD_FILM_CELLS
                + FIELD_MAX_BODIES * FIELD_MEDIUM_WORDS,
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
                + 6 * FIELD_FILM_CELLS
                + FIELD_MAX_BODIES * FIELD_MEDIUM_WORDS,
        );
        expect(field.reserve({ bricks: 128, table: 512 })).toBe(false);
    });

    it('contribuição aos raios, à película e à luz só com fluido: ray_volume_hit, ray_volume_surface, ray_volume_transmittance, scene_wetness, ray_volume_bounds, ray_volume_occupied e light_transmission', () => {
        const field = new FluidField();
        const contributions = field.getSceneContributions();
        expect(contributions.map((c) => c.point)).toEqual([
            rayVolumeHitPoint,
            rayVolumeSurfacePoint,
            rayVolumeTransmittancePoint,
            sceneWetnessPoint,
            rayVolumeBoundsPoint,
            rayVolumeOccupiedPoint,
            lightTransmissionPoint,
        ]);
        // A mesma ordem nos três: o `source` do acerto é a posição do contribuinte no ponto.
        expect(new Set(contributions.map((c) => c.order)).size).toBe(1);
        const slotOf = (): undefined => undefined;
        expect(contributions.map((c) => c.build(slotOf))).toEqual(
            contributions.map(() => undefined),
        );
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
        // O fechamento do corpo, avaliado uma vez por quadro na onda dos acertos (spec 039): o meio da absorção.
        expect(graph).toContain('RayVolumeSurface(body.x, body.y, field_medium(hit.material))');
        expect(graph).not.toContain('field_materials');
        // Sem avaliar a função: quem traça grava a referência na onda dos acertos e o kernel da classe a avalia (spec 039).
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
        // A caixa do campo, alvo dos fótons das cáusticas (spec 034, T067c).
        expect(composeWgsl(modules[4]!).spec.source).toContain('return field_box();');
        // Os raios que passam por algum bloco do campo (a emissão dos fótons só onde há água), sem amostrar φ.
        const occupied = composeWgsl(modules[5]!).spec.source;
        expect(occupied).toContain(
            'fn ray_volume_occupied(origin: vec3f, dir: vec3f, t_max: f32) -> bool',
        );
        expect(occupied).toContain('if (field_find(b) != NONE) { return true; }');
        // A luz das fontes que atravessa a água em linha reta (as cáusticas a corrigem): Fresnel exato na primeira
        // superfície e Beer–Lambert pelos trechos, numa marcha só (sem o acerto e a transmitância marchando o mesmo trecho).
        const light = composeWgsl(modules[6]!).spec.source;
        expect(light).toContain('fn light_transmission(light: u32, p: vec3f) -> vec3f');
        expect(light).toContain(
            'transmittance *= 1.0 - bsdf_f_dielectric(abs(dot(dir, at.normal)), select(ior, 1.0 / ior, start_inside));',
        );
        expect(light).toContain(
            'transmittance *= exp(-closure_absorption(c) * max(exit.t - enter, 0.0));',
        );
        expect(light).not.toContain('ray_volume_hit(');
        expect(light).not.toContain('ray_volume_transmittance(');
        field.setVolume(false);
        expect(contributions.map((c) => c.build(slotOf))).toEqual(
            contributions.map(() => undefined),
        );
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
