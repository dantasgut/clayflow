import { describe, expect, it, vi } from 'vitest';
import { FrameTargets } from '../FrameTargets';
import { renderScene } from '../../flows/__tests__/helpers/renderHarness';

describe('FrameTargets', () => {
    it('descritores (spec 011, 034): cor HDR rgba16float, movimento rgba16float, máscara reativa r8unorm, luz rgba16float (sem storage até alguém compor) e profundidade depth24plus, do tamanho do canvas (sem MSAA)', () => {
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
                textureShape: { format: 'rgba16float', sizeFromCanvas: true },
            },
            // A radiância acima do teto da cor (spec 041): o disco do sol para o espalhamento da lente, sob demanda.
            {
                id: 'overflow',
                role: 'texture',
                allocation: 'onDemand',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true },
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth24plus', sizeFromCanvas: true },
            },
        ]);
    });

    it('storage sob demanda (spec 041, T074): `setStorage` pede o storage de leitura e escrita na cor e na luz (a composição das nuvens) e na máscara reativa (o disco do sol); desligado, os alvos voltam sem o uso', () => {
        const t = new FrameTargets({ samples: 1 });
        const storage = (): Record<string, string | undefined> =>
            Object.fromEntries(t.getDescriptors().map((d) => [d.id, d.textureShape?.storage]));
        t.setStorage(true, false);
        expect(storage()).toMatchObject({
            color: 'read-write',
            light: 'read-write',
            reactive: undefined,
        });
        t.setStorage(false, true);
        expect(storage()).toMatchObject({
            color: undefined,
            light: undefined,
            reactive: 'read-write',
        });
        t.setStorage(false, false);
        expect(Object.values(storage()).every((v) => v === undefined)).toBe(true);
    });

    it('MSAA (padrão, spec 008): cor multiamostrada e profundidade com 4 amostras; a cor lida pelo pós é simples', async () => {
        expect(
            new FrameTargets().getDescriptors().map((d) => [d.id, d.textureShape?.sampleCount]),
        ).toEqual([
            ['color', undefined],
            ['overflow', undefined],
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
