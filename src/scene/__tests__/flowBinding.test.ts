import { describe, expect, it, vi } from 'vitest';
import type { LayoutSpec, StorageBufferSpec, TextureViewSpec } from '../../core/contracts/index';
import type { BindingKey, BindingSource } from '../flows/FlowBinding';
import { FlowBindingError } from '../flows/FlowBindingError';
import { wgslModule } from '../shaders/WgslModule';
import { wgslResource } from '../shaders/WgslResource';
import {
    ProbeBody,
    ProbeCam,
    ProbeCamSchema,
    ProbeFlow,
    ProbeParamsSchema,
    probeBodiesResource,
    probeCamResource,
    probeParams,
    probeParamsResource,
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

describe('flowBinding — resolução pelo fornecedor declarado (spec 031)', () => {
    it('fonte privada só liga recurso privado: num recurso com fornecedor → FlowBindingError (troca é por pools)', async () => {
        const own = storage('own_bodies');
        const s = await probeScene();
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    bindings: new Map<BindingKey, BindingSource>([
                        [probeParamsResource, probeParams],
                        [probeBodiesResource, own],
                    ]),
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).toThrow(FlowBindingError);
    });

    it('fonte privada pela identidade do recurso: outro recurso privado de mesmo nome não serve de fonte', async () => {
        const other = wgslResource({
            name: 'params',
            binding: { uniform: true },
            type: { schema: ProbeParamsSchema },
            frequency: 'draw',
            provider: 'private',
        });
        expect(other).not.toBe(probeParamsResource);
        const s = await probeScene();
        s.scene.flows.register(
            () => new ProbeFlow(probeParams, { bindings: new Map([[other, probeParams]]) }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).toThrow(/'params'.*sem fonte/);
    });

    it('pools no descritor troca o pool de um recurso neste pipeline (substitui { name, as })', async () => {
        const own = storage('own_bodies');
        const s = await probeScene();
        s.scene.consumers.register({
            name: 'OwnBodies',
            typeName: 'ProbeBody',
            resolve: () => ({ kind: 'buffer', buffer: own }),
        });
        const ready = vi.fn();
        s.scene.events.on('flowReady', ready);
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    pipelines: [
                        probePipeline(),
                        probePipeline({
                            id: 'own',
                            pools: new Map([[probeBodiesResource, 'OwnBodies']]),
                        }),
                    ],
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        s.scene.world.insert(new ProbeBody());
        const bound = ready.mock.calls[0]![0].payload.bound;
        expect(bound.compute('own').groupsOf('stage')[0].spec.bindings[0]).toMatchObject({
            buffer: own,
        });
        // O mesmo recurso no outro pipeline continua no fornecedor declarado.
        expect(bound.compute('main').groupsOf('stage')[0].spec.bindings[0]).toMatchObject({
            buffer: s.scene.resourceSystem.poolBufferSpec('ProbeBody'),
        });
    });

    it('pools apontando para chave sem resolver → o pipeline espera', async () => {
        const s = await probeScene();
        let flow: ProbeFlow | undefined;
        s.scene.flows.register(
            () => {
                flow = new ProbeFlow(probeParams, {
                    pipelines: [
                        probePipeline({ pools: new Map([[probeBodiesResource, 'Missing']]) }),
                    ],
                });
                return flow;
            },
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).not.toThrow();
        expect(flow!.lifecycle).not.toBe('ready');
    });

    it('recurso privado sem fonte → FlowBindingError com detalhes (grupo e ligação atribuídos)', async () => {
        const s = await probeScene();
        s.scene.flows.register(() => new ProbeFlow(probeParams, { bindings: new Map() }), {
            type: 'ProbeFlow',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        s.scene.world.insert(new ProbeCam());
        try {
            s.scene.world.insert(new ProbeBody());
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(FlowBindingError);
            expect((e as FlowBindingError).details).toEqual({
                flow: 'ProbeFlow',
                pipeline: 'main',
                group: 2,
                binding: 0,
                variable: 'params',
            });
        }
    });

    it('privado por objeto do recurso e por { pipeline, resource } (este vence no seu pipeline)', async () => {
        const other = { ...probeParams, discriminator: 'probe_params_twin' };
        const { ready } = await prepared({
            pipelines: [probePipeline(), probePipeline({ id: 'twin' })],
            bindings: new Map<BindingKey, BindingSource>([
                [probeParamsResource, probeParams],
                [{ pipeline: 'twin', resource: probeParamsResource }, other],
            ]),
        });
        const bound = ready.mock.calls[0]![0].payload.bound;
        expect(bound.compute('main').groupsOf('draw')[0].spec.bindings[0]).toMatchObject({
            buffer: probeParams,
        });
        expect(bound.compute('twin').groupsOf('draw')[0].spec.bindings[0]).toMatchObject({
            buffer: other,
        });
    });

    it('dois resolvers com o mesmo tipo: cada recurso liga o fornecedor que nomeia (sem ambiguidade)', async () => {
        const otherBuffer = { ...probeParams, discriminator: 'other_cam' };
        const otherCam = wgslResource({
            name: 'other_cam',
            binding: { uniform: true },
            type: { schema: ProbeCamSchema },
            frequency: 'frame',
            provider: { consumer: 'OtherCam' },
        });
        const shader = wgslModule({
            name: 'probe_two_cams',
            requires: [probeCamResource, otherCam, probeBodiesResource, probeParamsResource],
            source: `
@compute @workgroup_size(64) fn probe_main(@builtin(global_invocation_id) id: vec3u) {
    bodies[id.x].v = cam.scale * other_cam.scale * params.k;
}
`,
        });
        const s = await probeScene();
        s.scene.consumers.register({
            name: 'OtherCam',
            typeName: 'ProbeCam',
            resolve: () => ({ kind: 'buffer', buffer: otherBuffer }),
        });
        const ready = vi.fn();
        s.scene.events.on('flowReady', ready);
        s.scene.flows.register(
            () => new ProbeFlow(probeParams, { pipelines: [probePipeline({ shader })] }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        s.scene.world.insert(new ProbeBody());
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        const [frame] = p.groupsOf('frame');
        // Ordem de nome no grupo frame: cam, other_cam.
        expect(frame.spec.bindings[0]).toMatchObject({
            buffer: s.scene.resourceSystem.bufferOf(
                s.scene.world.rootOf(s.scene.world.queryBySchemaName('ProbeCam')[0]!)! as ProbeCam,
                'cam',
            ),
        });
        expect(frame.spec.bindings[1]).toMatchObject({ buffer: otherBuffer });
    });
});

describe('flowBinding — compatibilidade e offsets dinâmicos', () => {
    it('uniform recebendo storage → incompatível', async () => {
        const s = await probeScene();
        s.scene.flows.register(
            () =>
                new ProbeFlow(probeParams, {
                    bindings: new Map([[probeParamsResource, storage('wrong')]]),
                }),
            { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
        );
        s.scene.world.insert(new ProbeCam());
        expect(() => s.scene.world.insert(new ProbeBody())).toThrow(
            /'params'.*incompatível — binding uniform recebeu buffer 'storage'/,
        );
    });

    it('textura de profundidade num binding de cor → incompatível', async () => {
        const color = wgslResource({
            name: 'color',
            binding: { texture: { sample: 'f32' } },
            frequency: 'draw',
            provider: 'private',
        });
        const shader = wgslModule({
            name: 'probe_tex',
            requires: [probeCamResource, probeBodiesResource, color],
            source: `
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
                    bindings: new Map([[color, depthView]]),
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
            bindings: new Map<BindingKey, BindingSource>([
                [
                    probeParamsResource,
                    {
                        kind: 'buffer',
                        buffer: probeParams,
                        size: ProbeParamsSchema.stride,
                        dynamic: { stride: 256 },
                    },
                ],
            ]),
        });
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        // params (draw) é o grupo 2; frame (0) e stage (1) sem offset dinâmico.
        expect((p.spec.layouts as readonly LayoutSpec[])[2]!.entries[0]).toMatchObject({
            hasDynamicOffset: true,
        });
        expect(p.dynamic).toEqual([false, false, true]);
        expect(p.groupsOf('draw')[0].dynamic).toBe(true);
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
