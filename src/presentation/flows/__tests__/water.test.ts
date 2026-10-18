/**
 * Estágios da água (spec 017; superfície pelo campo dos fluidos, spec 033): sem corpo com `FluidSurfaceMaterial`, nada
 * dos estágios alocado nem gravado (só o que a contribuição à transmissão da luz lê) e o estado `caustics` do
 * `WaterSurface` em 0; com água, o campo, a marcha da câmera (profundidade, espessura, material e normal) e a
 * composição (cópia da cena + tela cheia); com a luz que projeta sombra, o enquadramento e a marcha na vista da luz e
 * as cáusticas antes do forward, que acendem `caustics`; o forward
 * chama a transmissão da água pelo ponto de cena `light_transmission` sem conhecê-la (spec 031); parâmetros escritos
 * quando os corpos mudam; troca de material em execução (`World.attach`/`detach`) entre sprites e água; nenhuma
 * leitura de volta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { FluidBody } from '../../../elements/physics/bodies/FluidBody';
import { FluidSurfaceMaterial } from '../../../elements/material/FluidSurfaceMaterial';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { WaterSurface } from '../../app/WaterSurface';
import { WaterStateSchema } from '../../water/schemas';
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

/** Descritores lidos pela transmissão da luz pela água (todo desenho que chama o ponto os liga): alocados sempre. */
/** Alocado na inserção da água: só o estado das cáusticas (16 B). */
const EAGER = new Set(['state']);

function waterOf(s: Awaited<ReturnType<typeof scene>>): WaterSurface {
    return s.scene.world.findResource(WaterSurface.schema, WaterSurface)!;
}

/** Descritores do `WaterSurface` alocados (texturas e buffers). */
function waterAllocs(s: Awaited<ReturnType<typeof scene>>): string[] {
    const rs = s.scene.resourceSystem;
    const water = waterOf(s);
    return water
        .getDescriptors()
        .map((d) => d.id)
        .filter(
            (id) => rs.textureOf(water, id) !== undefined || rs.bufferOf(water, id) !== undefined,
        );
}

/** Último `caustics` enviado ao estado do `WaterSurface` na GPU. */
function causticsFlag(s: Awaited<ReturnType<typeof scene>>): number | undefined {
    const state = s.scene.resourceSystem.bufferOf(waterOf(s), 'state');
    const last = vi
        .mocked(s.core.write)
        .mock.calls.filter(([spec]) => spec === state)
        .at(-1);
    if (last === undefined) return undefined;
    const data = last[1];
    const view = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    return view[WaterStateSchema.offsetOf('caustics') / 4];
}

/** Fontes dos shaders do desenho forward criados. */
function forwardShaders(s: Awaited<ReturnType<typeof scene>>): string[] {
    return vi
        .mocked(s.core.create)
        .mock.calls.map(
            ([spec]) => spec as { kind?: string; discriminator?: string; source?: string },
        )
        .filter(
            (spec) =>
                spec.kind === 'shader' && (spec.discriminator ?? '').startsWith('wgsl:forward'),
        )
        .map((spec) => spec.source ?? '');
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('estágios da água (spec 017)', () => {
    it('sem água: nenhum passe nem recurso dos estágios da água; cáusticas desligadas no estado', async () => {
        const s = await scene({ light: true });
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(10) }).add(new PointSpriteMaterial()),
        );
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        const passes = s.step();
        s.step();
        expect(passes.map((p) => p.label).filter((l) => /Fluid|Water/.test(l))).toEqual([]);
        expect(s.computes().filter((c) => /Fluid|Caustics|copy:/.test(c))).toEqual([]);
        expect(new Set(waterAllocs(s))).toEqual(EAGER);
        expect(waterOf(s).data.caustics).toBe(0);
        expect(causticsFlag(s)).toBe(0);
        // Sem cáusticas a água não contribui: o forward desenha com a transmissão pronta (spec 031).
        expect(s.step().find((p) => p.label === 'ForwardFlow')?.draws.length).toBeGreaterThan(0);
        const shaders = forwardShaders(s);
        expect(shaders.length).toBeGreaterThan(0);
        expect(shaders.some((src) => src.includes('fn water_caustic_factor('))).toBe(false);
        expect(
            shaders.some((src) =>
                src.includes(
                    'fn light_transmission(light: u32, p: vec3f) -> vec3f {\n    return vec3f(1.0);',
                ),
            ),
        ).toBe(true);
    });

    it('com água: o campo dos fluidos, a marcha da câmera e a composição; sprites não desenham o corpo', async () => {
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
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow', 'WaterFlow']);
        expect(passes.find((p) => p.label === 'WaterFlow')!.fullscreen).toBe(1);
        const computes = s.computes();
        const order = [
            'FluidFieldFlow.gather',
            'FluidFieldFlow.mark',
            'FluidFieldFlow.density',
            'FluidFieldFlow.redistance',
            'FluidFieldPassFlow.camera',
        ];
        expect(order.map((c) => computes.indexOf(c))).toEqual(
            [...order.map((c) => computes.indexOf(c))].sort((a, b) => a - b),
        );
        expect(order.every((c) => computes.includes(c))).toBe(true);
        expect(computes).toEqual(expect.arrayContaining([expect.stringMatching(/^copy:color/)]));
        // A vista da câmera alocou as texturas dela; a da luz (sem luz com sombra) não.
        expect(new Set(waterAllocs(s))).toEqual(new Set([...EAGER, 'depth', 'material', 'normal']));
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('ParticleFlow'))).toEqual([]);
        expect(s.core.readback).not.toHaveBeenCalled();
    });

    it('com luz que projeta sombra: enquadramento e marcha na vista da luz e cáusticas antes do forward', async () => {
        const s = await scene({ light: true });
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(50) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        const passes = s.step();
        const labels = passes.map((p) => p.label);
        expect(labels.indexOf('ShadowFlow')).toBeLessThan(labels.indexOf('ForwardFlow'));
        const computes = s.computes();
        const order = ['FluidFieldFlow.redistance', 'FluidFieldPassFlow.light', 'CausticsFlow'];
        expect(order.map((c) => computes.indexOf(c))).toEqual(
            [...order.map((c) => computes.indexOf(c))].sort((a, b) => a - b),
        );
        expect(order.every((c) => computes.includes(c))).toBe(true);
        expect(new Set(waterAllocs(s))).toEqual(
            new Set([
                ...EAGER,
                'depth',
                'material',
                'normal',
                'lightDepth',
                'lightMaterial',
                'lightNormal',
                'caustics',
                'lightMatrix',
                'photons',
            ]),
        );
        expect(waterOf(s).data.caustics).toBe(1);
        expect(causticsFlag(s)).toBe(1);
    });

    it('parâmetros do campo e da marcha escritos quando os corpos mudam, não por quadro', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(4) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        s.step();
        s.resetCounts();
        s.step();
        s.step();
        const params = (): readonly string[] =>
            s
                .writes()
                .map(discOf)
                .filter((d) => /^(field_gather|water_field_camera_params|params:)/.test(d));
        expect(params()).toEqual([]);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(3) }).add(new FluidSurfaceMaterial()),
        );
        s.step();
        expect(params().filter((d) => d.startsWith('field_gather'))).toHaveLength(1);
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
        expect(s.computes()).toContain('FluidFieldPassFlow.camera');
        s.scene.world.detach(body, water);
        s.scene.world.attach(body, new PointSpriteMaterial());
        now = labels();
        expect(now).toContain('ParticleFlow');
        expect(s.computes()).not.toContain('FluidFieldPassFlow.camera');
        expect(now).not.toContain('WaterFlow');
    });
});
