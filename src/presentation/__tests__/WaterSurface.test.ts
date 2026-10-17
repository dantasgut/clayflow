/**
 * Superfície de água da cena (spec 017): os descritores dos estágios sob demanda — na inserção só o que a contribuição à
 * transmissão da luz lê (estado, cáusticas, profundidade e matriz da vista da luz); `ensureAllocated` aloca textura
 * (com o tamanho do canvas ou o lado da vista da luz) e buffer; as do tamanho do canvas são recriadas com ele;
 * validação do `lightSize`; sinal de produção por vista, que liga as cáusticas no estado (escrito só quando muda); a
 * contribuição ao ponto `light_transmission` (spec 031) e os resolvers `WaterSurface.*`.
 */
import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../../scene/SceneContext';
import { countingCore } from '../../scene/__tests__/helpers/countingCore';
import { isWgslResource } from '../../scene/shaders/WgslResource';
import { lightTransmissionPoint } from '../../elements/scene/points/lighting';
import { WATER_LIGHT_TEXTURES, WATER_VIEW_TEXTURES, WaterSurface } from '../app/WaterSurface';
import { WATER_CONSUMERS } from '../water/consumers';
import { waterTransmission } from '../water/shaders';

/** Descritores lidos pela transmissão da luz pela água: alocados na inserção. */
/** Alocado na inserção: só o estado (16 B) que os desenhos já compostos com a água leem. */
const EAGER = new Set(['state']);

function setup(lightSize?: number) {
    const counting = countingCore();
    const scene = createScene({ core: counting.core });
    const water = new WaterSurface(lightSize === undefined ? {} : { lightSize });
    scene.world.insert(water);
    return { scene, water, rs: scene.resourceSystem, counting };
}

describe('WaterSurface (spec 017)', () => {
    it('na inserção, só o estado; tudo da vista e das cáusticas sob demanda (nada sem água)', () => {
        const s = setup();
        const ids = s.water.getDescriptors().map((d) => d.id);
        expect(ids.filter((id) => EAGER.has(id))).toEqual([...EAGER]);
        for (const d of s.water.getDescriptors()) {
            const allocated =
                s.rs.textureOf(s.water, d.id) !== undefined
                || s.rs.bufferOf(s.water, d.id) !== undefined;
            if (EAGER.has(d.id)) {
                expect(d.allocation ?? 'eager').toBe('eager');
                expect(allocated).toBe(true);
            } else {
                expect(d.allocation).toBe('onDemand');
                expect(allocated).toBe(false);
            }
        }
    });

    it('contribui com a transmissão da luz só com as cáusticas ligadas; os resolvers leem os descritores dela', () => {
        const s = setup();
        const contributions = s.water.getSceneContributions();
        expect(contributions).toHaveLength(1);
        const [c] = contributions;
        expect(c!.point).toBe(lightTransmissionPoint);
        expect(c!.pools).toEqual([]);
        expect(c!.build(() => undefined)).toBeUndefined();
        s.water.setCaustics(true);
        expect(c!.build(() => undefined)).toBe(waterTransmission);
        s.water.setCaustics(false);
        expect(c!.build(() => undefined)).toBeUndefined();
        for (const id of ['caustics', 'lightDepth', 'lightMatrix'])
            s.rs.ensureAllocated(s.water, id);
        expect(waterTransmission.source).toContain(
            'fn light_transmission(light: u32, p: vec3f) -> vec3f',
        );
        const resources = waterTransmission.requires.filter(isWgslResource);
        expect(
            [...resources]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((r) => [r.name, r.resource.provider]),
        ).toEqual([
            ['caustic_map', { consumer: 'WaterSurface.caustics' }],
            ['lights', { pool: 'Light' }],
            ['water_light_depth', { consumer: 'WaterSurface.lightDepth' }],
            ['water_light_matrix', { consumer: 'WaterSurface.lightMatrix' }],
            ['water_state', { consumer: 'WaterSurface.state' }],
        ]);
        const ctx = { world: s.scene.world, resources: s.rs };
        const byName = new Map(WATER_CONSUMERS.map((r) => [r.name, r]));
        const view = (id: string) => byName.get(`WaterSurface.${id}`)!.resolve(ctx);
        expect(view('caustics')).toMatchObject({
            kind: 'textureView',
            view: s.rs.textureViewOf(s.water, 'caustics'),
        });
        expect(view('lightDepth')).toMatchObject({
            kind: 'textureView',
            view: s.rs.textureViewOf(s.water, 'lightDepth'),
        });
        expect(view('lightMatrix')).toMatchObject({
            kind: 'buffer',
            buffer: s.rs.bufferOf(s.water, 'lightMatrix'),
        });
        expect(view('state')).toMatchObject({
            kind: 'buffer',
            buffer: s.rs.bufferOf(s.water, 'state'),
        });
    });

    it('ensureAllocated aloca as texturas da vista (canvas) e da luz (lightSize) e os buffers', () => {
        const s = setup(256);
        for (const id of [...WATER_VIEW_TEXTURES, ...WATER_LIGHT_TEXTURES])
            s.rs.ensureAllocated(s.water, id);
        const size = s.counting.core.canvasSize()!;
        const depth = s.rs.textureOf(s.water, 'depth')!;
        expect([depth.width, depth.height, depth.format]).toEqual([
            size.width,
            size.height,
            'r32float',
        ]);
        expect(s.rs.textureViewOf(s.water, 'depth')).toBeDefined();
        const light = s.rs.textureOf(s.water, 'lightDepth')!;
        expect([light.width, light.height]).toEqual([256, 256]);
        expect(s.rs.textureOf(s.water, 'caustics')!.format).toBe('rgba16float');
        expect(s.rs.textureOf(s.water, 'material')!.format).toBe('r32uint');
        const photons = s.rs.bufferOf(s.water, 'photons')!;
        expect(photons.byteSize).toBeGreaterThanOrEqual(3 * 256 * 256 * 4);
        expect(s.rs.bufferOf(s.water, 'lightMatrix')).toBeDefined();
        // Pedir de novo não realoca.
        s.rs.ensureAllocated(s.water, 'depth');
        expect(s.rs.textureOf(s.water, 'depth')).toBe(depth);
    });

    it('texturas do tamanho do canvas recriadas com ele; as da luz ficam', () => {
        const s = setup();
        s.rs.ensureAllocated(s.water, 'depth');
        s.rs.ensureAllocated(s.water, 'lightDepth');
        const light = s.rs.textureOf(s.water, 'lightDepth');
        s.scene.events.emit('canvasReconfigured', {
            width: 320,
            height: 200,
            format: 'bgra8unorm',
        });
        const depth = s.rs.textureOf(s.water, 'depth')!;
        expect([depth.width, depth.height]).toEqual([320, 200]);
        expect(s.rs.textureOf(s.water, 'lightDepth')).toBe(light);
    });

    it('lightSize validado; produção por vista é estado da C2 (um produtor por descritor)', () => {
        expect(() => new WaterSurface({ lightSize: 8 })).toThrow(/lightSize/);
        expect(() => new WaterSurface({ lightSize: 100.5 })).toThrow(/lightSize/);
        expect(new WaterSurface().lightSize).toBe(512);
        const s = setup();
        const { camera, light } = WaterSurface.producedDescriptor;
        const producer = {};
        expect([s.rs.isProduced(s.water, camera), s.rs.isProduced(s.water, light)]).toEqual([
            false,
            false,
        ]);
        s.rs.markProduced(producer, s.water, light, true);
        expect([s.rs.isProduced(s.water, camera), s.rs.isProduced(s.water, light)]).toEqual([
            false,
            true,
        ]);
        // Outro produtor do mesmo descritor no mesmo quadro: erro; "não produzi" de quem não é produtor é ignorado.
        expect(() => {
            s.rs.markProduced({}, s.water, light, true);
        }).toThrow(/outro produtor/);
        s.rs.markProduced({}, s.water, light, false);
        expect(s.rs.isProduced(s.water, light)).toBe(true);
        s.rs.markProduced(producer, s.water, light, false);
        expect(s.rs.isProduced(s.water, light)).toBe(false);
        expect(() => {
            s.rs.markProduced(producer, s.water, 'nope', true);
        }).toThrow(/não é descritor/);
    });

    it('as cáusticas ligadas no estado, enviado só quando muda', () => {
        const s = setup();
        const state = s.rs.bufferOf(s.water, 'state')!;
        const writes = () =>
            vi.mocked(s.counting.core.write).mock.calls.filter(([spec]) => spec === state).length;
        const flush = () => {
            s.scene.events.emit('frameTick', { dt: 0, realDt: 0, elapsed: 0, frame: 0 });
        };
        expect(s.water.data.caustics).toBe(0);
        flush();
        const before = writes();
        flush();
        expect([s.water.data.caustics, writes()]).toEqual([0, before]);
        s.water.setCaustics(true);
        flush();
        expect([s.water.data.caustics, writes()]).toEqual([1, before + 1]);
        s.water.setCaustics(true);
        flush();
        expect(writes()).toBe(before + 1);
        s.water.setCaustics(false);
        flush();
        expect([s.water.data.caustics, writes()]).toEqual([0, before + 2]);
    });
});
