import { describe, expect, it, vi } from 'vitest';
import { renderScene, registerStages } from './helpers/renderHarness';
import { ToneMapping } from '../../resources/ToneMapping';
import { Bloom } from '../effects/Bloom';
import { FrameTargets } from '../../app/FrameTargets';
import { PostFlow } from '../PostFlow';
import { PresentationParamsSchema } from '../renderSchemas';
import type { RenderPipelineSpec } from '../../../scene/contracts/gpu';

// Apresentação (spec 011, T007): o último passe do pós, sempre; o resolve mapeado por amostra sem efeitos; efeitos em
// HDR; parâmetros sem recriar pipeline; saída HDR com recuo anunciado.

/** Pipelines de render criados (pelo spec). */
function pipelines(creates: readonly unknown[]): RenderPipelineSpec[] {
    return creates.filter(
        (c): c is RenderPipelineSpec =>
            (c as { kind?: string }).kind === 'pipeline' && 'fragment' in (c as object),
    );
}

describe('PostFlow — apresentação', () => {
    it('sem efeitos e com MSAA: um passe só, a apresentação no canvas lendo a cor multiamostrada', async () => {
        const s = await renderScene();
        registerStages(s.scene, { post: true });
        s.step();
        const passes = s.step();
        const post = passes.filter((p) => p.label.startsWith('PostFlow'));
        expect(post.map((p) => p.label)).toEqual(['PostFlow.present']);
        expect(post[0]!.fullscreen).toBe(1);
        const fragments = pipelines(s.creates()).map((p) => p.fragment?.entryPoint);
        expect(fragments).toContain('fs_present_ms');
        expect(fragments).not.toContain('fs_passthrough');
    });

    it('sem MSAA: a apresentação lê a cor resolvida', async () => {
        const s = await renderScene();
        s.scene.world.insert(new FrameTargets({ samples: 1 }));
        s.scene.flows.register((ctx) => new PostFlow(ctx), { type: 'post', phase: 'post' });
        s.step();
        s.step();
        const fragments = pipelines(s.creates()).map((p) => p.fragment?.entryPoint);
        expect(fragments).toContain('fs_present');
        expect(fragments).not.toContain('fs_present_ms');
    });

    it('com efeitos: o efeito escreve no pingue-pongue rgba16float e a apresentação é o último passe', async () => {
        const s = await renderScene();
        const { post } = registerStages(s.scene, { post: true });
        post!.addEffect(new Bloom());
        s.step();
        const passes = s.step().filter((p) => p.label.startsWith('PostFlow'));
        expect(passes.map((p) => p.label)).toEqual(['PostFlow.Bloom', 'PostFlow.present']);
        const bloom = pipelines(s.creates()).find((p) => p.fragment?.entryPoint === 'fs_bloom')!;
        expect(bloom.fragment!.targets[0]!.format).toBe('rgba16float');
        const ping = s
            .creates()
            .filter(
                (c) =>
                    (c as { discriminator?: string }).discriminator?.startsWith('post_pp_')
                    === true,
            )
            .filter((c) => (c as { kind: string }).kind === 'texture');
        // Pingue-pongue dos efeitos, os dois históricos da resolução temporal e a imagem resolvida com a nitidez (spec
        // 034), todos HDR.
        expect(ping.map((t) => (t as { format: string }).format)).toEqual([
            'rgba16float',
            'rgba16float',
            'rgba16float',
            'rgba16float',
            'rgba16float',
        ]);
        const present = pipelines(s.creates()).find(
            (p) => p.fragment?.entryPoint === 'fs_present',
        )!;
        expect(present.fragment!.targets[0]!.format).toBe(s.core.canvasFormat);
    });

    it('mudar a apresentação reescreve os parâmetros sem recriar pipeline', async () => {
        const s = await renderScene();
        const presentation = new ToneMapping();
        s.scene.world.insert(presentation);
        registerStages(s.scene, { post: true });
        s.step();
        s.step();
        const before = pipelines(s.creates()).length;
        s.resetCounts();
        presentation.data.operator = 'aces';
        presentation.data.exposure = 1;
        s.step();
        expect(pipelines(s.creates())).toHaveLength(0);
        const written = vi
            .mocked(s.core.write)
            .mock.calls.filter(
                (c) => (c[0] as { discriminator?: string }).discriminator === 'post_present_params',
            );
        const bytes = written.at(-1)![1] as Uint8Array;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(view.getUint32(PresentationParamsSchema.offsetOf('toneOperator'), true)).toBe(1);
        expect(view.getFloat32(PresentationParamsSchema.offsetOf('exposure'), true)).toBe(2);
        expect(before).toBeGreaterThan(0);
    });

    it('saída HDR sem suporte: volta ao padrão e emite presentationFallback uma vez', async () => {
        const s = await renderScene();
        const fallback = vi.fn();
        s.scene.events.on('presentationFallback', fallback);
        const presentation = new ToneMapping({ output: 'hdr' });
        s.scene.world.insert(presentation);
        registerStages(s.scene, { post: true });
        s.step();
        s.step();
        s.step();
        expect(s.core.reconfigureCanvas).toHaveBeenCalledWith(
            expect.objectContaining({ toneMapping: 'extended', format: 'rgba16float' }),
        );
        expect(fallback).toHaveBeenCalledTimes(1);
        expect(fallback.mock.calls[0]![0]).toMatchObject({ requested: 'hdr' });
    });
});
