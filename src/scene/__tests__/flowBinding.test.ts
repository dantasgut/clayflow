import { describe, expect, it, vi } from 'vitest';
import type { LayoutSpec, StorageBufferSpec, TextureViewSpec } from '../../core/contracts/index';
import { FlowBindingError } from '../flows/FlowBindingError';
import { wgslModule } from '../shaders/WgslModule';
import {
    ProbeBody,
    ProbeBodySchema,
    ProbeCam,
    ProbeCamSchema,
    ProbeFlow,
    ProbeParamsSchema,
    probeParams,
    probePipeline,
    probeScene,
} from './helpers/probeFlow';

async function prepared(options: ConstructorParameters<typeof ProbeFlow>[1]) {
    const s = await probeScene();
    const ready = vi.fn();
    s.scene.events.on('flowReady', ready);
    s.scene.flows.register(() => new ProbeFlow(probeParams, options), {
        type: 'ProbeFlow',
        phase: 'physics',
        bodyType: 'ProbeBody',
    });
    s.scene.world.insert(new ProbeCam());
    s.scene.world.insert(new ProbeBody());
    return { ...s, ready };
}

const storage = (d: string): StorageBufferSpec => ({
    kind: 'buffer',
    subkind: 'storage',
    discriminator: d,
    byteSize: 64,
});

describe('flowBinding — ordem de resolução (R3)', () => {
    it('binding privado pelo nome da variável vence o consumes', async () => {
        const own = storage('own_bodies');
        const { ready } = await prepared({ bindings: { params: probeParams, bodies: own } });
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        expect(p.groups[0].bindings[1]).toMatchObject({ buffer: own });
    });

    it('typeName em consumes → resolver; sem nome de consumes com o tipo → FlowBindingError com detalhes', async () => {
        const s = await probeScene();
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    pipelines: [probePipeline({ consumes: ['ProbeBody'] })],
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        try {
            s.scene.world.insert(new ProbeBody());
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(FlowBindingError);
            expect((e as FlowBindingError).details).toEqual({
                flow: 'ProbeFlow',
                pipeline: 'main',
                group: 0,
                binding: 0,
                variable: 'cam',
            });
        }
    });

    it('dois nomes de consumes com o mesmo tipo → ambíguo', async () => {
        const s = await probeScene();
        s.scene.consumers.register({
            name: 'OtherCam',
            typeName: 'ProbeCam',
            resolve: () => undefined,
        });
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    pipelines: [probePipeline({ consumes: ['ProbeCam', 'OtherCam', 'ProbeBody'] })],
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).toThrow(/ambíguo.*ProbeCam e OtherCam/);
    });
});

describe('flowBinding — compatibilidade e offsets dinâmicos', () => {
    it('uniform recebendo storage → incompatível', async () => {
        const s = await probeScene();
        s.scene.flows.register(
            () => new ProbeFlow(probeParams, { bindings: { params: storage('wrong') } }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).toThrow(
            /'params'.*incompatível — binding uniform recebeu buffer 'storage'/,
        );
    });

    it('textura de profundidade num binding de cor → incompatível', async () => {
        const shader = wgslModule({
            name: 'probe_tex',
            structs: [ProbeCamSchema, ProbeBodySchema],
            source: `
@group(0) @binding(0) var<uniform> cam: ProbeCam;
@group(0) @binding(1) var<storage, read_write> bodies: array<ProbeBody>;
@group(1) @binding(0) var color: texture_2d<f32>;
@compute @workgroup_size(1) fn probe_main() { _ = cam; _ = bodies[0]; _ = textureLoad(color, vec2i(0), 0); }
`,
        });
        const depthView = {
            kind: 'textureview',
            source: { kind: 'texture', width: 4, height: 4, format: 'depth32float', usage: 0 },
        } as TextureViewSpec;
        const s = await probeScene();
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    pipelines: [probePipeline({ shader })],
                    bindings: { color: depthView },
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).toThrow(
            /cor recebeu textura de profundidade/,
        );
    });

    it('fonte dinâmica → hasDynamicOffset no layout e o grupo marcado como dinâmico', async () => {
        const { ready } = await prepared({
            bindings: {
                params: {
                    kind: 'buffer',
                    buffer: probeParams,
                    size: ProbeParamsSchema.stride,
                    dynamic: { stride: 256 },
                },
            },
        });
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        expect((p.spec.layouts as readonly LayoutSpec[])[1]!.entries[0]).toMatchObject({
            hasDynamicOffset: true,
        });
        expect(p.dynamic).toEqual([false, true]);
    });

    it('layouts de mesmo conteúdo têm a mesma identidade de conteúdo (dedup do core)', async () => {
        const { ready } = await prepared({
            pipelines: [probePipeline(), probePipeline({ id: 'twin' })],
        });
        const bound = ready.mock.calls[0]![0].payload.bound;
        const [a, b] = [bound.compute('main'), bound.compute('twin')];
        expect(a.spec.layouts).toEqual(b.spec.layouts);
        expect(a.groups[0]).toEqual(b.groups[0]);
    });
});
