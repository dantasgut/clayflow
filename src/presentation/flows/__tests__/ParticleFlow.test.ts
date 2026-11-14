/**
 * Desenho de corpos de partículas (spec 008, US1; spec 034 T060d): por corpo com `PointSpriteMaterial`, a lista das
 * partículas visíveis montada na GPU (compactação estável pelo tronco e pela hierarquia de profundidade) e um desenho
 * indireto dos argumentos dela; o pool e a lista ligados por pipeline (um por corpo) e a região do corpo por offset
 * dinâmico; parâmetros escritos quando os corpos mudam (não por quadro); corpo com outro material fica fora com aviso
 * único; nenhuma leitura de volta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluidBody } from '../../../elements/physics/bodies/FluidBody';
import { SoftBody } from '../../../elements/physics/bodies/SoftBody';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

const line = (n: number): number[] => Array.from({ length: n }, (_, i) => [i * 0.05, 0, 0]).flat();

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'scene', particles: true });
    s.scene.world.insert(new Camera().add(new Transform()));
    return s;
}

const drawsOf = (s: Awaited<ReturnType<typeof scene>>) =>
    s
        .step()
        .filter((p) => p.label === 'ParticleFlow')
        .flatMap((p) => p.vertexDraws);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ParticleFlow (spec 008)', () => {
    it('um desenho indireto por corpo, da lista montada na GPU; região por offset dinâmico', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(10_000) }).add(
                new PointSpriteMaterial(),
            ),
        );
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(5) }).add(new PointSpriteMaterial()),
        );
        s.scene.world.insert(
            new SoftBody({ algorithm: 'XPBD', position: line(7) }).add(new PointSpriteMaterial()),
        );
        const draws = drawsOf(s);
        // Os argumentos de cada corpo: o registro `SetCount` do descarte dele, no byte do desenho.
        expect(
            draws.map((d) => [
                discOf(d.indirect!.buffer).startsWith('particle_cull:'),
                d.indirect!.offset,
            ]),
        ).toEqual([
            [true, 16],
            [true, 16],
            [true, 16],
        ]);
        expect(new Set(draws.map((d) => d.indirect!.buffer)).size).toBe(3);
        // Por corpo: a compactação estável (marcas, soma, espalhamento), a contagem copiada e os argumentos.
        const computes = s.computes();
        expect(computes.filter((c) => c === 'Compaction.flags')).toHaveLength(3);
        expect(computes.filter((c) => c === 'Compaction.scatter')).toHaveLength(3);
        expect(computes.filter((c) => c === 'CountToArgs')).toHaveLength(3);
        // A região do corpo é o único grupo com offset dinâmico (frequência `draw`, spec 031).
        expect(
            draws.map(
                (d) =>
                    [...d.bindGroups.values()].find((g) => g.offsets !== undefined)?.offsets?.[0],
            ),
        ).toEqual([0, 256, 512]);
        // Um pipeline por corpo (o pool e a lista dele ligados ao pipeline).
        expect(new Set(draws.map((d) => d.pipeline)).size).toBe(3);
    });

    it('parâmetros escritos quando os corpos mudam, não por quadro; nenhuma leitura de volta', async () => {
        const s = await scene();
        s.scene.world.insert(
            new FluidBody({ algorithm: 'PBF', position: line(4) }).add(new PointSpriteMaterial()),
        );
        s.step();
        s.resetCounts();
        s.step();
        s.step();
        expect(s.writes().filter((w) => discOf(w).startsWith('particle_draw_params'))).toHaveLength(
            0,
        );
        s.scene.world.insert(
            new FluidBody({ algorithm: 'PBF', position: line(3) }).add(new PointSpriteMaterial()),
        );
        s.step();
        expect(s.writes().filter((w) => discOf(w).startsWith('particle_draw_params'))).toHaveLength(
            1,
        );
        expect(s.core.readback).not.toHaveBeenCalled();
    });

    it('corpo removido sai do desenho', async () => {
        const s = await scene();
        const a = new FluidBody({ algorithm: 'SPH', position: line(2) }).add(
            new PointSpriteMaterial(),
        );
        s.scene.world.insert(a);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(3) }).add(new PointSpriteMaterial()),
        );
        expect(drawsOf(s)).toHaveLength(2);
        s.scene.world.remove(a);
        expect(drawsOf(s)).toHaveLength(1);
    });

    it('corpo com outro material: fora do desenho, aviso único', async () => {
        const s = await scene();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: line(2) }).add(new StandardMaterial()),
        );
        expect(drawsOf(s)).toHaveLength(0);
        s.step();
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('ParticleFlow'))).toHaveLength(
            1,
        );
    });
});
