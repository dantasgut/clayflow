import { describe, expect, it, vi } from 'vitest';
import type { BindGroupSpec, LayoutSpec } from '../../../core/contracts/index';
import { FlowBindingError } from '../../flows/FlowBindingError';
import type { BindGroupReplacedEvent } from '../../events/BindGroupReplacedEvent';
import { SingletonResolver } from '../../consumers/strategies/SingletonResolver';
import { wgslModule } from '../../shaders/WgslModule';
import { wgslResource } from '../../shaders/WgslResource';
import {
    ProbeBody,
    ProbeCam,
    ProbeCamSchema,
    ProbeFlow,
    probeBodiesResource,
    probeCamResource,
    probeParams,
    probeParamsResource,
    probePipeline,
    probeScene,
} from '../helpers/probeFlow';

const COMPUTE = 4;

async function readyProbe(options?: ConstructorParameters<typeof ProbeFlow>[1]) {
    const s = await probeScene();
    let flow: ProbeFlow | undefined;
    const registration = s.scene.flows.register(
        () => {
            flow = new ProbeFlow(probeParams, options);
            return flow;
        },
        { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
    );
    return { ...s, registration, flow: () => flow };
}

describe('US1 — estágio declara o que consome e recebe tudo ligado', () => {
    it('cenário 1: bind groups criados pela C2 com grupos, bindings e visibilidades do WGSL', async () => {
        const { scene, flow } = await readyProbe();
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        scene.world.insert(new ProbeBody());
        expect(flow()?.lifecycle).toBe('ready');
        expect(ready).toHaveBeenCalledTimes(1);
        const bound = ready.mock.calls[0]![0].payload.bound;
        const p = bound.compute('main');
        // Grupos pela frequência dos recursos: 0 = frame (cam), 1 = stage (bodies), 2 = draw (params).
        expect(p.groups).toHaveLength(3);
        const layouts = p.spec.layouts as readonly LayoutSpec[];
        expect(layouts[0]!.entries).toEqual([
            { binding: 0, visibility: COMPUTE, kind: 'buffer', type: 'uniform' },
        ]);
        expect(layouts[1]!.entries).toEqual([
            { binding: 0, visibility: COMPUTE, kind: 'buffer', type: 'storage' },
        ]);
        expect(layouts[2]!.entries).toEqual([
            { binding: 0, visibility: COMPUTE, kind: 'buffer', type: 'uniform' },
        ]);
        const buffers = (g: unknown) =>
            (g as BindGroupSpec).bindings.map((b) => (b.kind === 'buffer' ? b.buffer : undefined));
        expect(buffers(p.groups[0])).toEqual([
            scene.resourceSystem.bufferOf(
                scene.world.rootOf(scene.world.queryBySchemaName('ProbeCam')[0]!)! as ProbeCam,
                'cam',
            ),
        ]);
        expect(buffers(p.groups[1])).toEqual([scene.resourceSystem.poolBufferSpec('ProbeBody')]);
        expect((p.groups[2] as BindGroupSpec).bindings[0]).toMatchObject({ buffer: probeParams });
        expect(p.groupsOf('frame')[0].spec).toBe(p.groups[0]);
        expect(p.groupsOf('stage')[0].spec).toBe(p.groups[1]);
        expect(p.groupsOf('draw')[0].spec).toBe(p.groups[2]);
    });

    it('cenário 3: fornecedor do recurso sem resolver na cena → o pipeline espera (sem erro, sem bind group); com o resolver, fica pronto', async () => {
        const wind = wgslResource({
            name: 'wind',
            binding: { uniform: true },
            type: { schema: ProbeCamSchema },
            frequency: 'frame',
            provider: { consumer: 'Wind' },
        });
        const windShader = wgslModule({
            name: 'probe_wind',
            requires: [probeCamResource, wind, probeBodiesResource, probeParamsResource],
            source: `
@compute @workgroup_size(64) fn probe_main(@builtin(global_invocation_id) id: vec3u) {
    bodies[id.x].v = cam.scale * wind.scale * params.k;
}
`,
        });
        const { scene, flow, frame, counting } = await readyProbe({
            pipelines: [probePipeline({ shader: windShader })],
        });
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        expect(() => scene.world.insert(new ProbeBody())).not.toThrow();
        frame();
        expect(flow()!.lifecycle).not.toBe('ready');
        expect(ready).not.toHaveBeenCalled();
        expect(flow()!.dispatched).toEqual([]);
        expect(counting.stats().creates.get('bindgroup') ?? 0).toBe(0);
        scene.consumers.register(new SingletonResolver(ProbeCamSchema, 'cam', { name: 'Wind' }));
        scene.world.insert(new ProbeBody());
        frame();
        expect(flow()!.lifecycle).toBe('ready');
        expect(ready).toHaveBeenCalledTimes(1);
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        const [frameGroup] = p.groupsOf('frame');
        // Ligações do grupo frame em ordem de nome: cam, wind — o mesmo singleton pelos dois resolvers.
        const cam = scene.resourceSystem.bufferOf(
            scene.world.rootOf(scene.world.queryBySchemaName('ProbeCam')[0]!)! as ProbeCam,
            'cam',
        );
        expect(
            (frameGroup.spec as BindGroupSpec).bindings.map((b) =>
                b.kind === 'buffer' ? b.buffer : undefined,
            ),
        ).toEqual([cam, cam]);
    });

    it('cenário 4: recurso privado sem fonte → erro com recurso, grupo, ligação, pipeline e estágio', async () => {
        const { scene } = await readyProbe({ bindings: new Map() });
        scene.world.insert(new ProbeCam());
        let error: unknown;
        try {
            scene.world.insert(new ProbeBody());
        } catch (e) {
            error = e;
        }
        expect(error).toBeInstanceOf(FlowBindingError);
        expect((error as Error).message).toMatch(
            /recurso privado 'params' \(@group\(2\) @binding\(0\)\).*'main'.*'ProbeFlow'.*ctx\.bind/,
        );
    });

    it('cenário 5: pool cresce → a C2 recria o bind group, emite bindGroupReplaced e o Flow grava com o novo', async () => {
        const { scene, frame, flow, counting } = await readyProbe();
        scene.world.insert(new ProbeCam());
        scene.world.insert(new ProbeBody());
        frame();
        const replaced: BindGroupReplacedEvent[] = [];
        scene.events.on('bindGroupReplaced', (e) => replaced.push(e));
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        const before = flow()!;
        const bodies = (before as unknown as { slots: unknown }).slots;
        void bodies;
        for (let i = 0; i < 16; i++) scene.world.insert(new ProbeBody());
        frame();
        expect(replaced).toHaveLength(1);
        // O pool vive no grupo da frequência stage (1); os grupos frame e draw não mudam.
        expect(replaced[0]).toMatchObject({ flow: 'ProbeFlow', pipeline: 'main', group: 1 });
        const newSpec = replaced[0]!.newSpec;
        expect(newSpec.bindings[0]).toMatchObject({
            buffer: scene.resourceSystem.poolBufferSpec('ProbeBody'),
        });
        expect(counting.core.destroy).toHaveBeenCalledWith(replaced[0]!.oldSpec);
        expect(before.events.some((e) => e.type === 'bindGroupReplaced')).toBe(true);
        expect(before.events.some((e) => e.type === 'poolReallocated')).toBe(true);
        expect(before.lifecycle).toBe('ready');
        expect(ready).not.toHaveBeenCalled();
        expect(before.dispatched.at(-1)).toBe(17);
    });

    it('cenário 6: visibilidade explícita do descritor vence a inferência', async () => {
        const { scene } = await readyProbe({
            pipelines: [probePipeline({ bindings: { params: { visibility: COMPUTE | 1 } } })],
        });
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        scene.world.insert(new ProbeBody());
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        expect((p.spec.layouts as readonly LayoutSpec[])[2]!.entries[0]).toMatchObject({
            visibility: COMPUTE | 1,
        });
    });

    it('dispatch só grava: nenhuma criação de objeto de GPU durante a gravação do quadro', async () => {
        const { scene, frame, counting, flow } = await readyProbe();
        scene.world.insert(new ProbeCam());
        for (let i = 0; i < 20; i++) scene.world.insert(new ProbeBody());
        frame();
        frame();
        expect(flow()!.dispatched).toEqual([20, 20]);
        expect(counting.stats().createdWhileRecording).toEqual([]);
    });

    it('sem o singleton obrigatório o Flow fica pendente e não grava; perder o slot o suspende', async () => {
        const { scene, frame, flow } = await readyProbe();
        scene.world.insert(new ProbeBody());
        frame();
        expect(flow()!.lifecycle).toBe('pending');
        expect(flow()!.dispatched).toEqual([]);
        const cam = new ProbeCam();
        scene.world.insert(cam);
        frame();
        expect(flow()!.lifecycle).toBe('ready');
        scene.world.remove(cam);
        frame();
        expect(flow()!.lifecycle).toBe('pending');
        expect(flow()!.events.at(-1)).toEqual({ type: 'slotLost', slot: 'cam' });
        expect(flow()!.dispatched).toEqual([1]);
    });
});
