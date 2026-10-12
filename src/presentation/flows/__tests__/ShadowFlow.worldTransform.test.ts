import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

async function scene(scale: [number, number, number, number] = [1, 1, 1, 1]) {
    const s = await renderScene();
    registerStages(s.scene, { shadow: true });
    s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
    const box = new BoxGeometry({ size: [1, 1, 1] }).add(
        new Transform({ position: [2, 0, 0, 1], scale }),
    );
    const id = s.scene.world.insert(box);
    const worldSlot = () => s.scene.resourceSystem.poolSlotOf('WorldTransform', id);
    return { ...s, id, box, worldSlot };
}

describe('ShadowFlow — matriz de mundo por slot', () => {
    it('grupo 1 é storage somente leitura visível no vértice, ligado ao pool WorldTransform', async () => {
        const s = await scene();
        s.step();
        const [draw] = s.draws('ShadowFlow');
        const group = draw!.bindGroups.get(1)!.group;
        expect(group.layout.entries[0]).toMatchObject({
            kind: 'buffer',
            type: 'read-only-storage',
            visibility: GPUShaderStage.VERTEX,
        });
        expect(group.bindings[0]).toMatchObject({
            buffer: s.scene.resourceSystem.poolBufferSpec('WorldTransform'),
        });
    });

    it('desenha com firstInstance = slot e sem criar nem escrever transform por objeto', async () => {
        const s = await scene();
        s.step();
        s.resetCounts();
        s.step();
        expect(s.draws('ShadowFlow').map((d) => d.firstInstance)).toEqual([s.worldSlot()]);
        expect(s.creates()).toHaveLength(0);
        expect(s.writes().some((w) => discOf(w).startsWith('shadow_transform'))).toBe(false);
    });

    it('escala com determinante negativo usa frontFace cw', async () => {
        const s = await scene([1, 1, -2, 1]);
        s.step();
        expect(s.draws('ShadowFlow')[0]!.pipeline.primitive?.frontFace).toBe('cw');
    });

    it('desenha na textura de profundidade do ShadowMap da luz, sem cor', async () => {
        const s = await scene();
        const [pass] = s.step().filter((p) => p.label === 'ShadowFlow');
        expect(pass!.target.colorAttachments).toHaveLength(0);
        expect(discOf(pass!.target.depthStencilAttachment?.view)).toMatch(/depth/);
    });

    it('religa o grupo 1 quando o pool WorldTransform é realocado', async () => {
        const s = await scene();
        s.step();
        const before = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        for (let i = 0; i < 300; i++) s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        const after = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        expect(after).not.toBe(before);
        expect(s.draws('ShadowFlow')[0]!.bindGroups.get(1)!.group.bindings[0]).toMatchObject({
            buffer: after,
        });
    });

    it('sem luz que projeta sombra o estágio não grava', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new DirectionalLight({ castShadow: false }));
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        expect(s.step().filter((p) => p.label === 'ShadowFlow')).toHaveLength(0);
    });
});
