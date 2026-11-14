import { describe, expect, it, vi } from 'vitest';
import { FrameTargets } from '../FrameTargets';
import { renderScene } from '../../flows/__tests__/helpers/renderHarness';

describe('FrameTargets', () => {
    it('descritores (spec 011, 034): cor HDR rgba16float, movimento rgba16float, máscara reativa r8unorm, luz rg16float e profundidade depth24plus, do tamanho do canvas (sem MSAA)', () => {
        expect(new FrameTargets({ samples: 1 }).getDescriptors()).toEqual([
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true },
            },
            // Vetores de movimento do antisserrilhado temporal (spec 034), só sem MSAA.
            {
                id: 'motion',
                role: 'texture',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true },
            },
            // Máscara reativa (T044a): onde o histórico recomeça.
            {
                id: 'reactive',
                role: 'texture',
                textureShape: { format: 'r8unorm', sizeFromCanvas: true },
            },
            {
                id: 'light',
                role: 'texture',
                textureShape: { format: 'rg16float', sizeFromCanvas: true },
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
        expect([samples.sampleCount, samples.format]).toEqual([4, 'rgba16float']);
        // Multiamostrada: só alvo de render e leitura.
        expect(samples.usage).toBe(
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        );
    });

    it('a C2 aloca a cor HDR e a profundidade no tamanho do canvas', async () => {
        const s = await renderScene();
        const targets = new FrameTargets();
        s.scene.world.insert(targets);
        s.step();
        const color = s.scene.resourceSystem.textureOf(targets, 'color')!;
        const depth = s.scene.resourceSystem.textureOf(targets, 'depth')!;
        expect([color.width, color.height, color.format]).toEqual([800, 600, 'rgba16float']);
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
