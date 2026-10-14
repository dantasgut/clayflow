/**
 * Geometria escrita pela GPU no forward e na sombra (spec 008, US4): sem índices → `draw.vertices` pela contagem de
 * vértices; `PointCloudGeometry` desenha os `activeCount` primeiros pontos (sprites com `PointSpriteMaterial`); fora da
 * deduplicação; aviso único quando ninguém escreve os vértices.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PointCloudGeometry } from '../../../elements/geometry/PointCloudGeometry';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { registerStages, renderScene } from './helpers/renderHarness';

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'scene', shadow: true });
    s.scene.world.insert(new Camera().add(new Transform()));
    s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
    return s;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('geometria escrita pela GPU no desenho (spec 008)', () => {
    it('nuvem de pontos com sprites: 6 vértices por ponto ativo; activeCount mutável', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await scene();
        const cloud = new PointCloudGeometry({ maxPoints: 100, activeCount: 40 });
        s.scene.world.insert(cloud.add(new PointSpriteMaterial()).add(new Transform()));
        s.step();
        const sprites = () =>
            s
                .step()
                .find((p) => p.label === 'ForwardFlow')!
                .vertexDraws.map((d) => d.indexCount);
        expect(sprites()).toEqual([240]);
        cloud.data.activeCount = 10;
        expect(sprites()).toEqual([60]);
    });

    it('sem índices e com material de triângulos: draw.vertices no forward e na sombra', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await scene();
        s.scene.world.insert(
            new PointCloudGeometry({ maxPoints: 30 })
                .add(new StandardMaterial())
                .add(new Transform()),
        );
        s.step();
        const passes = s.step();
        const of = (label: string) =>
            passes
                .find((p) => p.label === label)!
                .vertexDraws.map((d) => [d.indexCount, d.instanceCount]);
        expect(of('ForwardFlow')).toEqual([[30, 1]]);
        expect(of('ShadowFlow')).toEqual([[30, 1]]);
    });

    it('fora da deduplicação: duas nuvens iguais têm buffers próprios', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await scene();
        const a = new PointCloudGeometry({ maxPoints: 8 });
        const b = new PointCloudGeometry({ maxPoints: 8 });
        s.scene.world.insert(a.add(new PointSpriteMaterial()).add(new Transform()));
        s.scene.world.insert(b.add(new PointSpriteMaterial()).add(new Transform()));
        expect(s.scene.resourceSystem.bufferOf(a, 'vertices')).not.toBe(
            s.scene.resourceSystem.bufferOf(b, 'vertices'),
        );
    });

    it('sem escritor: aviso único nomeando a entidade; com escritor, nenhum', async () => {
        const s = await scene();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const lonely = new PointCloudGeometry({ maxPoints: 4 });
        const id = s.scene.world.insert(lonely.add(new PointSpriteMaterial()).add(new Transform()));
        const written = new PointCloudGeometry({ maxPoints: 4 });
        s.scene.world.insert(written.add(new PointSpriteMaterial()).add(new Transform()));
        s.scene.resourceSystem.acquireOwnership({}, written, 'vertices');
        s.step();
        s.step();
        const messages = warn.mock.calls
            .map((c) => String(c[0]))
            .filter((m) => m.includes("upload 'never'"));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain(`entidade ${id}`);
    });
});
