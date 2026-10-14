/**
 * Estágios da água (spec 017): sem corpo com `FluidSurfaceMaterial`, nada alocado nem gravado e o forward com
 * `causticsEnabled = 0`; com água, a superfície da câmera (esferas, espessura, suavização) e a composição (cópia da
 * cena + tela cheia); com a luz que projeta sombra, a vista da luz (caixa envolvente, esferas, suavização) e as
 * cáusticas antes do forward, que acende `causticsEnabled`; parâmetros escritos quando os corpos mudam; troca de
 * material em execução (`World.attach`/`detach`) entre sprites e água; nenhuma leitura de volta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluidBody } from '../../../elements/physics/bodies/FluidBody';
import { FluidSurfaceMaterial } from '../../../elements/material/FluidSurfaceMaterial';
import { ForwardFrameParamsSchema } from '../../../elements/material/forwardSchemas';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { WaterSurface } from '../../app/WaterSurface';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

const line = (n: number): number[] => Array.from({ length: n }, (_, i) => [i * 0.05, 0, 0]).flat();

async function scene(options: { light?: boolean } = {}) {
    const s = await renderScene();
    registerStages(s.scene, {
        forward: 'scene',
        particles: true,
        water: true,
        shadow: options.light === true,
    });
    s.scene.world.insert(new Camera().add(new Transform()));
    if (options.light === true) s.scene.world.insert(new DirectionalLight({ castShadow: true }));
    return s;
}

/** Descritores do `WaterSurface` alocados (texturas e buffers sob demanda). */
function waterAllocs(s: Awaited<ReturnType<typeof scene>>): string[] {
    const rs = s.scene.resourceSystem;
    const water = s.scene.world.findResource(WaterSurface.schema, WaterSurface)!;
    return water
        .getDescriptors()
        .map((d) => d.id)
        .filter(
            (id) => rs.textureOf(water, id) !== undefined || rs.bufferOf(water, id) !== undefined,
        );
}

/** Último `causticsEnabled` escrito nos parâmetros do quadro do forward. */
function causticsFlag(s: Awaited<ReturnType<typeof scene>>): number | undefined {
    const calls = vi
        .mocked(s.core.write)
        .mock.calls.filter(([spec]) => discOf(spec) === 'forward_frame_params');
    const last = calls.at(-1);
    if (last === undefined) return undefined;
    const data = last[1];
    const view = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    return view[ForwardFrameParamsSchema.offsetOf('causticsEnabled') / 4];
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('estágios da água (spec 017)', () => {
    it('sem água: nenhum passe nem recurso da água; forward com causticsEnabled = 0', async () => {
        const s = await scene({ light: true });
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(10) }).add(new PointSpriteMaterial()),
        );
        const passes = s.step();
        s.step();
        expect(passes.map((p) => p.label).filter((l) => /Fluid|Water/.test(l))).toEqual([]);
        expect(s.computes().filter((c) => /Fluid|Caustics|copy:/.test(c))).toEqual([]);
        expect(waterAllocs(s)).toEqual([]);
        expect(causticsFlag(s)).toBe(0);
    });

    it('com água: esferas (um desenho por corpo), espessura, suavização e composição; sprites não desenham o corpo', async () => {
        const s = await scene();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(1000) }).add(
                new FluidSurfaceMaterial(),
            ),
        );
        s.scene.world.insert(
            new FluidBody({ algorithm: 'PBF', position: line(7) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        const passes = s.step();
        const labels = passes.map((p) => p.label);
        expect(labels).toEqual([
            'ForwardFlow',
            'FluidSurfaceFlow.depth',
            'FluidSurfaceFlow.thickness',
            'WaterFlow',
        ]);
        const depth = passes.find((p) => p.label === 'FluidSurfaceFlow.depth')!;
        expect(depth.vertexDraws.map((d) => [d.indexCount, d.instanceCount])).toEqual([
            [6, 1000],
            [6, 7],
        ]);
        expect(passes.find((p) => p.label === 'WaterFlow')!.fullscreen).toBe(1);
        expect(s.computes()).toEqual(
            expect.arrayContaining([
                'FluidSurfaceFlow.smooth',
                expect.stringMatching(/^copy:color/),
            ]),
        );
        // A vista da câmera alocou as texturas dela; a da luz (sem luz com sombra) não.
        expect(new Set(waterAllocs(s))).toEqual(
            new Set([
                'depthRaw',
                'depthTemp',
                'depth',
                'thicknessRaw',
                'thicknessTemp',
                'thickness',
                'material',
                'depthStencil',
                'background',
            ]),
        );
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('ParticleFlow'))).toEqual([]);
        expect(s.core.readback).not.toHaveBeenCalled();
    });

    it('com luz que projeta sombra: caixa da luz, esferas e suavização na vista da luz e cáusticas antes do forward', async () => {
        const s = await scene({ light: true });
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(50) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        const passes = s.step();
        const labels = passes.map((p) => p.label);
        expect(labels.indexOf('ShadowFlow')).toBeLessThan(
            labels.indexOf('FluidSurfaceFlow.lightDepth'),
        );
        expect(labels.indexOf('FluidSurfaceFlow.lightDepth')).toBeLessThan(
            labels.indexOf('ForwardFlow'),
        );
        const computes = s.computes();
        const order = [
            'FluidSurfaceFlow.lightBounds',
            'FluidSurfaceFlow.lightSmooth',
            'CausticsFlow',
        ];
        expect(order.map((c) => computes.indexOf(c))).toEqual(
            [...order.map((c) => computes.indexOf(c))].sort((a, b) => a - b),
        );
        expect(order.every((c) => computes.includes(c))).toBe(true);
        expect(causticsFlag(s)).toBe(1);
    });

    it('parâmetros de desenho escritos quando os corpos mudam, não por quadro', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(4) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        s.resetCounts();
        s.step();
        s.step();
        expect(s.writes().filter((w) => discOf(w).startsWith('water_camera_draw_params'))).toEqual(
            [],
        );
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(3) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        expect(
            s.writes().filter((w) => discOf(w).startsWith('water_camera_draw_params')),
        ).toHaveLength(1);
    });

    it('troca de material em execução: sprites → água → sprites, sem recriar o corpo', async () => {
        const s = await scene();
        const sprites = new PointSpriteMaterial();
        const body = new FluidBody({ algorithm: 'SPH', position: line(20) }).add(sprites);
        s.scene.world.insert(body);
        const labels = () => s.step().map((p) => p.label);
        expect(labels()).toContain('ParticleFlow');
        const water = new FluidSurfaceMaterial();
        s.scene.world.detach(body, sprites);
        s.scene.world.attach(body, water);
        let now = labels();
        expect(now).not.toContain('ParticleFlow');
        expect(now).toContain('FluidSurfaceFlow.depth');
        s.scene.world.detach(body, water);
        s.scene.world.attach(body, new PointSpriteMaterial());
        now = labels();
        expect(now).toContain('ParticleFlow');
        expect(now).not.toContain('FluidSurfaceFlow.depth');
        expect(now).not.toContain('WaterFlow');
    });
});
