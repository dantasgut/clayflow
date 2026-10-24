import { describe, expect, it, vi } from 'vitest';
import { renderScene, registerStages } from './helpers/renderHarness';
import { ToneMapping } from '../../resources/ToneMapping';
import { Bloom } from '../effects/Bloom';
import { FrameTargets } from '../../app/FrameTargets';
import { PostFlow } from '../PostFlow';
import { PresentationParamsSchema } from '../renderSchemas';
import type { RenderPipelineSpec } from '../../../scene/contracts/gpu';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { TemporalAntialiasing } from '../../../elements/scene/TemporalAntialiasing';

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

    /** Cena com o antisserrilhado temporal (sem MSAA): a resolução abre o pós (spec 034). */
    async function temporalScene() {
        const s = await renderScene();
        s.scene.world.insert(new TemporalAntialiasing({ mode: 'temporal' }));
        s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
        const { post } = registerStages(s.scene, { forward: 'scene', post: true, samples: 1 });
        return { s, post: post! };
    }

    it('temporal sem efeitos: a nitidez já apresenta no canvas, sem passe só de apresentação (G2)', async () => {
        const { s } = await temporalScene();
        s.step();
        const passes = s.step().filter((p) => p.label.startsWith('PostFlow'));
        expect(passes.map((p) => p.label)).toEqual([
            'PostFlow.temporalResolve',
            'PostFlow.present',
        ]);
        const fragments = pipelines(s.creates());
        const present = fragments.find((p) => p.fragment?.entryPoint === 'fs_temporal_present')!;
        expect(present.fragment!.targets[0]!.format).toBe(s.core.canvasFormat);
        expect(fragments.map((p) => p.fragment?.entryPoint)).not.toContain('fs_present');
    });

    it.each([
        ['half', [], 'rgba16float', false],
        ['full', ['float32-filterable'], 'rgba32float', false],
        ['full', [], 'rgba16float', true],
    ] as const)(
        "historyPrecision '%s' (features %j): histórico de cor %s; aviso %s (spec 037, T040)",
        async (precision, features, format, warns) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const s = await renderScene({ features: [...features] });
            s.scene.world.insert(
                new TemporalAntialiasing({ mode: 'temporal', historyPrecision: precision }),
            );
            s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
            registerStages(s.scene, { forward: 'scene', post: true, samples: 1 });
            s.step();
            s.step();
            const resolve = pipelines(s.creates()).find(
                (p) => p.fragment?.entryPoint === 'fs_temporal_resolve',
            )!;
            expect(resolve.fragment!.targets[0]!.format).toBe(format);
            expect(warn.mock.calls.some((c) => String(c[0]).includes('float32-filterable'))).toBe(
                warns,
            );
            warn.mockRestore();
        },
    );

    it('temporal: os quadros do histórico ficam no estado de 32 bits, exatos além de 2048 (spec 037, T041)', async () => {
        const { s } = await temporalScene();
        s.step();
        const resolve = pipelines(s.creates()).find(
            (p) => p.fragment?.entryPoint === 'fs_temporal_resolve',
        )!;
        // Cor, estado (distância, movimento, quadros) e luz.
        expect(resolve.fragment!.targets[1]!.format).toBe('rgba32float');
        const source = resolve.fragment!.shader.source;
        expect(source).toContain('out.state.z = min(frames + 1.0, TAA_MAX_FRAMES);');
        expect(source).toContain('out.state.z = n + 1.0;');
        expect(source).not.toContain('history.a');
        // Em 16 bits (o alfa de antes), 2048 é o último inteiro exato: 2049 arredonda para 2048 e o contador para.
        const f16 = new Float32Array(1);
        const half = (x: number): number => {
            f16[0] = x;
            const bits = new Uint32Array(f16.buffer)[0]!;
            const mantissa = bits & 0x7fffff;
            const keep = mantissa & ~0x1fff;
            const round = mantissa & 0x1fff;
            const up = round > 0x1000 || (round === 0x1000 && (keep & 0x2000) !== 0);
            new Uint32Array(f16.buffer)[0] = (bits & ~0x7fffff) + keep + (up ? 0x2000 : 0);
            return f16[0];
        };
        expect(half(2048 + 1)).toBe(2048);
        expect(Math.fround(2048 + 1)).toBe(2049);
    });

    it('temporal com efeitos: a nitidez fica no HDR e a apresentação lê o último efeito', async () => {
        const { s, post } = await temporalScene();
        post.addEffect(new Bloom());
        s.step();
        const passes = s.step().filter((p) => p.label.startsWith('PostFlow'));
        expect(passes.map((p) => p.label)).toEqual([
            'PostFlow.temporalResolve',
            'PostFlow.temporalSharpen',
            'PostFlow.Bloom',
            'PostFlow.present',
        ]);
        const fragments = pipelines(s.creates()).map((p) => p.fragment?.entryPoint);
        expect(fragments).toContain('fs_present');
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
        // Pingue-pongue dos efeitos e a imagem resolvida com a nitidez (spec 034), todos HDR; as séries da resolução
        // temporal são canais temporais da C2 (`TemporalAntialiasing`, spec 037), não texturas do estágio.
        expect(ping.map((t) => (t as { format: string }).format)).toEqual([
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
