import { describe, expect, it, vi } from 'vitest';
import { FrameTargets } from '../FrameTargets';
import { renderScene } from '../../flows/__tests__/helpers/renderHarness';

describe('FrameTargets', () => {
    it('descritores: cor no formato do canvas e profundidade depth24plus, ambas do tamanho do canvas (sem MSAA)', () => {
        expect(new FrameTargets({ samples: 1 }).getDescriptors()).toEqual([
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

    it('MSAA (padrão, spec 008): cor multiamostrada e profundidade com 4 amostras; a cor lida pelo pós é simples', async () => {
        expect(
            new FrameTargets().getDescriptors().map((d) => [d.id, d.textureShape?.sampleCount]),
        ).toEqual([
            ['color', undefined],
            ['depth', 4],
            ['samples', 4],
        ]);
        const s = await renderScene();
        const targets = new FrameTargets();
        s.scene.world.insert(targets);
        s.step();
        const samples = s.scene.resourceSystem.textureOf(targets, 'samples')!;
        expect([samples.sampleCount, samples.format]).toEqual([4, s.core.canvasFormat]);
        // Multiamostrada: só alvo de render e leitura.
        expect(samples.usage).toBe(
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        );
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
