/**
 * Desenho por grupo de instâncias (spec 007, US1): o forward desenha um grupo por (geometria, shader do material,
 * orientação) e a sombra um por (geometria, orientação); a composição muda por eventos e a gravação não percorre
 * entidades.
 */
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { WireframeMaterial } from '../../../elements/material/WireframeMaterial';
import { PointSpriteMaterial } from '../../../elements/material/PointSpriteMaterial';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { Geometry } from '../../../elements/geometry/Geometry';
import { discOf, registerStages, renderScene, type DrawCall } from './helpers/renderHarness';

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, { shadow: true, forward: 'scene' });
    s.scene.world.insert(new Camera().add(new Transform()));
    s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
    return s;
}

const instances = (draws: readonly DrawCall[]) => draws.map((d) => d.instanceCount);
const total = (draws: readonly DrawCall[]) => draws.reduce((n, d) => n + d.instanceCount, 0);

/** Material de linhas (topologia `line-list`): as arestas da geometria. */
class LineMaterial extends WireframeMaterial {
    override getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            { ...super.getPipelineDescriptors()[0]!, id: 'pipeline_lines', topology: 'line-list' },
        ];
    }
}

describe('topologia do material (spec 008)', () => {
    it('cada material desenha a sua topologia: triângulos, arestas e sprites; grupos por topologia', async () => {
        const s = await scene();
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.scene.world.insert(new BoxGeometry().add(new LineMaterial()).add(new Transform()));
        s.scene.world.insert(new BoxGeometry().add(new PointSpriteMaterial()).add(new Transform()));
        s.step();
        const passes = s.step();
        const forward = passes.find((p) => p.label === 'ForwardFlow')!;
        const topologies = forward.draws.map((d) => [d.pipeline.primitive?.topology, d.indexCount]);
        // Caixa: 36 índices de triângulo; arestas: 6 por triângulo (12 triângulos).
        expect(topologies).toEqual([
            ['triangle-list', 36],
            ['line-list', 72],
        ]);
        expect(forward.draws[1]!.pipeline.primitive?.cullMode).toBe('none');
        // Sprites: 6 vértices por vértice da caixa (24), sem vertex buffer.
        expect(forward.vertexDraws.map((d) => [d.indexCount, d.instanceCount])).toEqual([[144, 1]]);
        // Sombra: só a caixa de triângulos.
        expect(instances(s.draws('ShadowFlow'))).toEqual([1]);
    });

    it('o índice de arestas é gerado por kernel uma vez por geometria e liberado com o último grupo de linhas', async () => {
        const s = await scene();
        const a = new BoxGeometry().add(new LineMaterial()).add(new Transform());
        const b = new BoxGeometry()
            .add(new LineMaterial())
            .add(new Transform({ position: [2, 0, 0, 1] }));
        s.scene.world.insert(a);
        s.scene.world.insert(b);
        s.step();
        expect(s.computes().filter((c) => c === 'ForwardFlow.edges')).toHaveLength(1);
        s.step();
        expect(s.computes().filter((c) => c === 'ForwardFlow.edges')).toHaveLength(0);
        s.resetCounts();
        s.scene.world.remove(a);
        s.scene.world.remove(b);
        s.step();
        expect(s.destroys().some((d) => discOf(d).startsWith('forward_edges'))).toBe(true);
    });

    it('castsShadow do material vale sobre a topologia', async () => {
        const s = await scene();
        const wire = new LineMaterial();
        wire.castsShadow = true;
        s.scene.world.insert(new BoxGeometry().add(wire).add(new Transform()));
        s.step();
        expect(instances(s.draws('ShadowFlow'))).toEqual([1]);
    });
});

describe('desenho por grupo de instâncias (spec 007)', () => {
    it('forward: 2 geometrias × 2 shaders = 4 desenhos; sombra: 2 geometrias = 2 desenhos', async () => {
        const s = await scene();
        for (let i = 0; i < 40; i++) {
            const geometry = i % 2 === 0 ? new BoxGeometry() : new SphereGeometry({ radius: 0.5 });
            const material = i % 4 < 2 ? new StandardMaterial() : new WireframeMaterial();
            s.scene.world.insert(
                geometry.add(material).add(new Transform({ position: [i, 0, 0, 1] })),
            );
        }
        s.step();
        expect(instances(s.draws('ForwardFlow'))).toEqual([10, 10, 10, 10]);
        expect(instances(s.draws('ShadowFlow'))).toEqual([20, 20]);
        // Cada desenho usa os buffers da geometria do grupo (uma cópia por conteúdo).
        expect(new Set(s.draws('ForwardFlow').map((d) => d.vertex)).size).toBe(2);
    });

    it('escala espelhada vai para o grupo da variante cw; troca de sinal em execução muda de grupo', async () => {
        const s = await scene();
        const flipped = new Transform({ scale: [-1, 1, 1, 1] });
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(flipped));
        s.step();
        const faces = () =>
            s.draws('ForwardFlow').map((d) => [d.pipeline.primitive?.frontFace, d.instanceCount]);
        expect(faces()).toEqual([
            ['ccw', 1],
            ['cw', 1],
        ]);
        flipped.data.scale = [1, 1, 1, 1];
        s.step();
        expect(faces()).toEqual([['ccw', 2]]);
    });

    it('inserção e remoção entram e saem do desenho do grupo', async () => {
        const s = await scene();
        const boxes = Array.from({ length: 5 }, () =>
            new BoxGeometry().add(new StandardMaterial()).add(new Transform()),
        );
        for (const b of boxes) s.scene.world.insert(b);
        s.step();
        expect(total(s.draws('ForwardFlow'))).toBe(5);
        s.scene.world.remove(boxes[2]!);
        s.scene.world.remove(boxes[4]!);
        s.step();
        expect(instances(s.draws('ForwardFlow'))).toEqual([3]);
        expect(instances(s.draws('ShadowFlow'))).toEqual([3]);
        for (const b of boxes.slice(0, 2)) s.scene.world.remove(b);
        s.scene.world.remove(boxes[3]!);
        s.step();
        expect(s.draws('ForwardFlow')).toEqual([]);
    });

    it('posição e rotação mudando não reavaliam a chave; a escala sim (rekeyOn)', async () => {
        const s = await scene();
        const transforms = Array.from({ length: 200 }, () => new Transform());
        for (const t of transforms)
            s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(t));
        s.step();
        const key = vi.spyOn(Geometry.prototype, 'contentKey', 'get');
        for (const [i, t] of transforms.entries()) {
            t.data.position = [i, 1, 0, 1];
            t.data.rotation = [0, 0, 0, 1];
        }
        s.step();
        expect(key).not.toHaveBeenCalled();
        transforms[0]!.data.scale = [2, 2, 2, 1];
        s.step();
        expect(key).toHaveBeenCalled();
        key.mockRestore();
        expect(instances(s.draws('ForwardFlow'))).toEqual([200]);
    });

    it('com a cena parada a gravação não reavalia chaves nem percorre entidades', async () => {
        const s = await scene();
        for (let i = 0; i < 1000; i++)
            s.scene.world.insert(
                new BoxGeometry().add(new StandardMaterial()).add(new Transform()),
            );
        s.step();
        s.step();
        // As chaves de grupo leem a chave de conteúdo da geometria: nenhuma leitura com a cena parada.
        const key = vi.spyOn(Geometry.prototype, 'contentKey', 'get');
        const get = vi.spyOn(Map.prototype, 'get');
        get.mockClear();
        s.step();
        expect(key).not.toHaveBeenCalled();
        // Consultas a Map por quadro independem das 1000 entidades (sem varredura por entidade).
        expect(get.mock.calls.length).toBeLessThan(500);
        get.mockRestore();
        key.mockRestore();
        expect(instances(s.draws('ForwardFlow'))).toEqual([1000]);
    });
});
