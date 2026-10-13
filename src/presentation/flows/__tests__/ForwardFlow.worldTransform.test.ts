import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

async function scene(scale: [number, number, number, number] = [1, 1, 1, 1]) {
    const s = await renderScene();
    registerStages(s.scene, { forward: 'canvas' });
    s.scene.world.insert(new Camera().add(new Transform()));
    const transform = new Transform({ position: [5, 0, 0, 1], scale });
    const box = new BoxGeometry({ size: [1, 1, 1] })
        .add(new StandardMaterial({ albedo: [1, 0, 0, 1] }))
        .add(transform);
    const id = s.scene.world.insert(box);
    const worldSlot = () => s.scene.resourceSystem.poolSlotOf('WorldTransform', id);
    return { ...s, id, box, transform, worldSlot };
}

describe('ForwardFlow — matriz de mundo por slot', () => {
    it('grupo 1 é storage somente leitura visível no vértice, ligado ao pool WorldTransform', async () => {
        const s = await scene();
        s.step();
        const [draw] = s.draws('ForwardFlow');
        const group = draw!.bindGroups.get(1)!.group;
        expect(group.layout.entries[0]).toMatchObject({
            kind: 'buffer',
            type: 'read-only-storage',
            visibility: GPUShaderStage.VERTEX,
        });
        expect(group.bindings[0]).toMatchObject({
            kind: 'buffer',
            buffer: s.scene.resourceSystem.poolBufferSpec('WorldTransform'),
        });
    });

    it('as duas caixas iguais saem num desenho; a matriz de cada uma vem do WorldTransform pelo registro', async () => {
        const s = await scene();
        const id = s.scene.world.insert(
            new BoxGeometry().add(new StandardMaterial()).add(new Transform()),
        );
        s.step();
        const draws = s.draws('ForwardFlow');
        expect(draws.map((d) => d.instanceCount)).toEqual([2]);
        // O registro Renderable da entidade aponta para o slot dela no pool WorldTransform.
        const rs = s.scene.resourceSystem;
        expect(rs.poolSlotOf('WorldTransform', id)).toBeDefined();
        expect(rs.poolSlotOf('Renderable', id)).toBeDefined();
        expect(s.worldSlot()).toBeDefined();
    });

    it('não cria nem escreve buffer de transform por objeto, em quadros seguidos', async () => {
        const s = await scene();
        s.step();
        s.resetCounts();
        s.step();
        s.step();
        expect(s.creates()).toHaveLength(0);
        expect(s.writes().some((w) => discOf(w).startsWith('forward_transform'))).toBe(false);
    });

    it('escala com determinante negativo usa frontFace cw', async () => {
        const s = await scene([-1, 1, 1, 1]);
        s.step();
        const [draw] = s.draws('ForwardFlow');
        expect(draw!.pipeline.primitive?.frontFace).toBe('cw');
    });

    it('escala positiva usa frontFace ccw e troca ao espelhar em tempo de execução', async () => {
        const s = await scene();
        s.step();
        expect(s.draws('ForwardFlow')[0]!.pipeline.primitive?.frontFace).toBe('ccw');
        s.transform.data.scale = [1, -1, 1, 1];
        s.step();
        expect(s.draws('ForwardFlow')[0]!.pipeline.primitive?.frontFace).toBe('cw');
    });

    it('religa o grupo 1 quando o pool WorldTransform é realocado', async () => {
        const s = await scene();
        s.step();
        const before = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        // Crescimento do pool: muitas entidades com transform ⇒ realocação.
        for (let i = 0; i < 300; i++) {
            s.scene.world.insert(
                new BoxGeometry().add(new StandardMaterial()).add(new Transform()),
            );
        }
        s.step();
        const after = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        expect(after).not.toBe(before);
        const [draw] = s.draws('ForwardFlow');
        expect(draw!.bindGroups.get(1)!.group.bindings[0]).toMatchObject({ buffer: after });
    });
});
