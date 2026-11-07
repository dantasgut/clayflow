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
    return { ...s, id, box };
}

/**
 * Ligação `worlds` do desenho das páginas da sombra: no grupo `stage` (o 1, depois do `frame` com `shadow_matrices`), a
 * entrada ligada ao buffer `pool` (as demais do grupo: `instances`, `sp`, o espaço de trabalho e os pares).
 */
function worldsOf(draw: DrawCall | undefined, pool: unknown) {
    const group = draw!.bindGroups.get(1)!.group;
    const k = group.bindings.findIndex((b) => (b as { buffer?: unknown }).buffer === pool);
    return { layout: group.layout.entries[k], binding: group.bindings[k] };
}

describe('ShadowFlow — matriz de mundo por slot', () => {
    it('worlds (grupo stage) é storage somente leitura visível no vértice, ligado ao pool WorldTransform', async () => {
        const s = await scene();
        s.step();
        const [draw] = s.draws('ShadowFlow');
        const pool = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        const worlds = worldsOf(draw, pool);
        expect(worlds.layout).toMatchObject({
            kind: 'buffer',
            type: 'read-only-storage',
            visibility: GPUShaderStage.VERTEX,
        });
        expect(worlds.binding).toMatchObject({ buffer: pool });
    });

    it('desenha pelos argumentos das páginas (a instância pelo par) e sem criar nem escrever transform por objeto', async () => {
        const s = await scene();
        s.step();
        s.resetCounts();
        s.step();
        // A instância do desenho é um par (entidade × página suja), escrito na GPU; a entidade acha o seu slot no pool
        // pela lista de instâncias.
        const draws = s.draws('ShadowFlow');
        expect(draws.map((d) => [d.instanceCount, d.firstInstance])).toEqual([[1, undefined]]);
        expect(draws[0]!.indirect?.buffer).toBeDefined();
        expect(s.creates()).toHaveLength(0);
        expect(s.writes().some((w) => discOf(w).startsWith('shadow_transform'))).toBe(false);
    });

    it('escala com determinante negativo usa frontFace cw', async () => {
        const s = await scene([1, 1, -2, 1]);
        s.step();
        expect(s.draws('ShadowFlow')[0]!.pipeline.primitive?.frontFace).toBe('cw');
    });

    it('desenha uma página por vez no anexo do tamanho dela, sem profundidade: o atlas é buffer (T060h)', async () => {
        const s = await scene();
        const [pass] = s.step().filter((p) => p.label === 'ShadowFlow');
        expect(pass!.target.colorAttachments).toHaveLength(1);
        expect(pass!.target.colorAttachments[0]).toMatchObject({
            loadOp: 'clear',
            storeOp: 'discard',
        });
        expect(discOf(pass!.target.colorAttachments[0]!.view)).toMatch(/shadow_raster/);
        expect(pass!.target.depthStencilAttachment).toBeUndefined();
    });

    it('religa worlds quando o pool WorldTransform é realocado', async () => {
        const s = await scene();
        s.step();
        const before = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        for (let i = 0; i < 300; i++) s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        const after = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        expect(after).not.toBe(before);
        expect(worldsOf(s.draws('ShadowFlow')[0], after).binding).toMatchObject({ buffer: after });
    });

    it('sem luz que projeta sombra o estágio não grava', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new DirectionalLight({ castShadow: false }));
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        expect(s.step().filter((p) => p.label === 'ShadowFlow')).toHaveLength(0);
    });
});
