import { describe, expect, it, vi } from 'vitest';
import { FrameTargets } from '../FrameTargets';
import { renderScene } from '../../flows/__tests__/helpers/renderHarness';

describe('FrameTargets', () => {
    it('descritores: cor no formato do canvas e profundidade depth24plus, ambas do tamanho do canvas', () => {
        expect(new FrameTargets().getDescriptors()).toEqual([
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: 'canvas', sizeFromCanvas: true },
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth24plus', sizeFromCanvas: true },
            },
        ]);
    });

    it('a C2 aloca as duas texturas no tamanho e no formato do canvas', async () => {
        const s = await renderScene();
        const targets = new FrameTargets();
        s.scene.world.insert(targets);
        s.step();
        const color = s.scene.resourceSystem.textureOf(targets, 'color')!;
        const depth = s.scene.resourceSystem.textureOf(targets, 'depth')!;
        expect([color.width, color.height, color.format]).toEqual([800, 600, s.core.canvasFormat]);
        expect([depth.width, depth.height, depth.format]).toEqual([800, 600, 'depth24plus']);
        expect(s.scene.resourceSystem.textureViewOf(targets, 'color')).toBeDefined();
    });

    it('canvasReconfigured recria as texturas no novo tamanho e destrói as antigas', async () => {
        const s = await renderScene();
        const targets = new FrameTargets();
        s.scene.world.insert(targets);
        s.step();
        const old = ['color', 'depth'].map((id) => s.scene.resourceSystem.textureOf(targets, id)!);
        vi.mocked(s.core.canvasSize).mockReturnValue({ width: 320, height: 200 });
        s.scene.events.emit('canvasReconfigured', {
            width: 320,
            height: 200,
            format: s.core.canvasFormat,
        });
        const now = ['color', 'depth'].map((id) => s.scene.resourceSystem.textureOf(targets, id)!);
        expect(now.map((t) => [t.width, t.height])).toEqual([
            [320, 200],
            [320, 200],
        ]);
        expect(s.destroys()).toEqual(expect.arrayContaining(old));
    });
});
