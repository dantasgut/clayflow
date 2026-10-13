import { describe, expect, it, vi } from 'vitest';
import type { BindGroupSpec, LayoutSpec } from '../../../core/contracts/index';
import { FlowBindingError } from '../../flows/FlowBindingError';
import type { BindGroupReplacedEvent } from '../../events/BindGroupReplacedEvent';
import {
    ProbeBody,
    ProbeCam,
    ProbeFlow,
    probeParams,
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
        expect(p.groups).toHaveLength(2);
        const layouts = p.spec.layouts as readonly LayoutSpec[];
        expect(layouts[0]!.entries).toEqual([
            { binding: 0, visibility: COMPUTE, kind: 'buffer', type: 'uniform' },
            { binding: 1, visibility: COMPUTE, kind: 'buffer', type: 'storage' },
        ]);
        expect(layouts[1]!.entries).toEqual([
            { binding: 0, visibility: COMPUTE, kind: 'buffer', type: 'uniform' },
        ]);
        const g0 = p.groups[0] as BindGroupSpec;
        expect(g0.bindings.map((b) => (b.kind === 'buffer' ? b.buffer : undefined))).toEqual([
            scene.resourceSystem.bufferOf(
                scene.world.rootOf(scene.world.queryBySchemaName('ProbeCam')[0]!)! as ProbeCam,
                'cam',
            ),
            scene.resourceSystem.poolBufferSpec('ProbeBody'),
        ]);
        expect((p.groups[1] as BindGroupSpec).bindings[0]).toMatchObject({ buffer: probeParams });
    });

    it('cenário 3: nome de consumes sem resolver → erro com o nome, o estágio e os resolvers disponíveis', async () => {
        const { scene } = await readyProbe({
            pipelines: [probePipeline({ consumes: ['ProbeCam', 'ProbeBody', 'Wind'] })],
        });
        scene.world.insert(new ProbeCam());
        expect(() => scene.world.insert(new ProbeBody())).toThrow(FlowBindingError);
        try {
            scene.world.insert(new ProbeBody());
        } catch (e) {
            expect((e as Error).message).toMatch(/'ProbeFlow'.*'Wind'.*disponíveis: .*ProbeCam/);
        }
    });

    it('cenário 4: binding sem slot nem consumes → erro com binding, grupo e estágio', async () => {
        const { scene } = await readyProbe({ bindings: {} });
        scene.world.insert(new ProbeCam());
        expect(() => scene.world.insert(new ProbeBody())).toThrow(
            /binding 'params' \(@group\(1\) @binding\(0\).*'main'.*'ProbeFlow'/,
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
        expect(replaced[0]).toMatchObject({ flow: 'ProbeFlow', pipeline: 'main', group: 0 });
        const newSpec = replaced[0]!.newSpec;
        expect(newSpec.bindings[1]).toMatchObject({
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
        expect((p.spec.layouts as readonly LayoutSpec[])[1]!.entries[0]).toMatchObject({
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
