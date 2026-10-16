import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene, type DrawCall } from './helpers/renderHarness';

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

/**
 * Ligação `worlds` do desenho de sombra: grupo `stage` (o 1, depois do `frame` com `shadow_matrices`), na posição do
 * nome entre os recursos do grupo (`instances`, `shadow`, `worlds`).
 */
function worldsOf(draw: DrawCall | undefined) {
    const group = draw!.bindGroups.get(1)!.group;
    return { layout: group.layout.entries[2], binding: group.bindings[2] };
}

describe('ShadowFlow — matriz de mundo por slot', () => {
    it('worlds (grupo stage) é storage somente leitura visível no vértice, ligado ao pool WorldTransform', async () => {
        const s = await scene();
        s.step();
        const [draw] = s.draws('ShadowFlow');
        const worlds = worldsOf(draw);
        expect(worlds.layout).toMatchObject({
            binding: 2,
            kind: 'buffer',
            type: 'read-only-storage',
            visibility: GPUShaderStage.VERTEX,
        });
        expect(worlds.binding).toMatchObject({
            binding: 2,
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

    it('religa worlds quando o pool WorldTransform é realocado', async () => {
        const s = await scene();
        s.step();
        const before = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        for (let i = 0; i < 300; i++) s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        const after = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        expect(after).not.toBe(before);
        expect(worldsOf(s.draws('ShadowFlow')[0]).binding).toMatchObject({ buffer: after });
    });

    it('sem luz que projeta sombra o estágio não grava', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new DirectionalLight({ castShadow: false }));
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        expect(s.step().filter((p) => p.label === 'ShadowFlow')).toHaveLength(0);
    });
});
