/**
 * Água pelo campo dos fluidos (spec 033; aparência pelo grafo, spec 034 T066): sem corpo de fluido com função
 * `material`, nada construído; com ele, o campo a cada quadro e a contribuição aos raios — sem passe próprio da câmera
 * (o que a câmera vê da água é traçado e composto pela refração) e sem desenho de sprites; os parâmetros do campo
 * escritos quando os corpos mudam, não por quadro; troca de aparência em execução (`World.attach`/`detach`) entre
 * sprites e água; nenhuma leitura de volta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { FluidBody } from '../../../elements/physics/bodies/FluidBody';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { FluidField } from '../../../elements/fields/FluidField';
import { discOf, registerStages, renderScene, waterMaterial } from './helpers/renderHarness';

const line = (n: number): number[] => Array.from({ length: n }, (_, i) => [i * 0.05, 0, 0]).flat();

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'scene', particles: true, water: true });
    s.scene.world.insert(new Camera().add(new Transform()));
    return s;
}

const fieldOf = (s: Awaited<ReturnType<typeof scene>>): FluidField =>
    s.scene.world.findResource(FluidField.schema, FluidField)!;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('água pelo campo dos fluidos (spec 033, spec 034 T066)', () => {
    it('sem água: nada do campo construído nem contribuição aos raios', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(10) }).add(new PointSpriteMaterial()),
        );
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        const passes = s.step();
        s.step();
        expect(passes.map((p) => p.label).filter((l) => /Fluid|Water/.test(l))).toEqual([]);
        expect(s.computes().filter((c) => /Fluid|Caustics|copy:/.test(c))).toEqual([]);
        expect(fieldOf(s).volume).toBe(false);
    });

    it('com água pelo grafo: o campo para os raios, sem passe da câmera; sprites não desenham o corpo', async () => {
        const s = await scene();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(1000) }).add(waterMaterial()),
        );
        s.scene.world.insert(
            new FluidBody({ algorithm: 'PBF', position: line(7) }).add(waterMaterial()),
        );
        s.step();
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow']);
        const computes = s.computes();
        const order = [
            'FluidFieldFlow.gather',
            'FluidFieldFlow.mark',
            'FluidFieldFlow.density',
            'FluidFieldFlow.redistance',
        ];
        expect(order.map((c) => computes.indexOf(c))).toEqual(
            [...order.map((c) => computes.indexOf(c))].sort((a, b) => a - b),
        );
        expect(order.every((c) => computes.includes(c))).toBe(true);
        expect(computes.filter((c) => c.startsWith('copy:color'))).toEqual([]);
        expect(fieldOf(s).volume).toBe(true);
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('ParticleFlow'))).toEqual([]);
        expect(s.core.readback).not.toHaveBeenCalled();
    });

    it('parâmetros do campo escritos quando os corpos mudam, não por quadro', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(4) }).add(waterMaterial()),
        );
        s.step();
        s.step();
        s.resetCounts();
        s.step();
        s.step();
        const gathers = (): readonly string[] =>
            s
                .writes()
                .map(discOf)
                .filter((d) => d.startsWith('field_gather'));
        expect(gathers()).toEqual([]);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(3) }).add(waterMaterial()),
        );
        s.step();
        expect(gathers()).toHaveLength(1);
    });

    it('troca de aparência em execução: sprites → água → sprites, sem recriar o corpo', async () => {
        const s = await scene();
        const sprites = new PointSpriteMaterial();
        const body = new FluidBody({ algorithm: 'SPH', position: line(20) }).add(sprites);
        s.scene.world.insert(body);
        const labels = () => s.step().map((p) => p.label);
        expect(labels()).toContain('ParticleFlow');
        const water = waterMaterial();
        s.scene.world.detach(body, sprites);
        s.scene.world.attach(body, water);
        let now = labels();
        expect(now).not.toContain('ParticleFlow');
        expect(s.computes()).toContain('FluidFieldFlow.gather');
        s.scene.world.detach(body, water);
        s.scene.world.attach(body, new PointSpriteMaterial());
        now = labels();
        expect(now).toContain('ParticleFlow');
        expect(s.computes()).not.toContain('FluidFieldFlow.gather');
    });
});
