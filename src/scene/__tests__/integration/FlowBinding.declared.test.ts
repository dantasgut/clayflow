import { describe, expect, it, vi } from 'vitest';
import type { BindGroupSpec } from '../../../core/contracts/index';
import { wgslModule } from '../../shaders/WgslModule';
import { wgslResource } from '../../shaders/WgslResource';
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
} from '../helpers/probeFlow';

const cam = wgslResource({
    name: 'cam',
    binding: { uniform: true },
    type: { schema: ProbeCamSchema },
    frequency: 'frame',
    provider: { consumer: 'ProbeCam' },
});
const bodies = wgslResource({
    name: 'bodies',
    binding: { storage: 'read_write' },
    type: { schema: ProbeBodySchema, array: true },
    frequency: 'stage',
    provider: { pool: 'ProbeBody' },
});
const params = wgslResource({
    name: 'params',
    binding: { uniform: true },
    type: { schema: ProbeParamsSchema },
    frequency: 'draw',
    provider: 'private',
});

const declaredShader = wgslModule({
    name: 'probe_declared',
    requires: [cam, bodies, params],
    source: `
fn scale_of() -> vec4f { return cam.scale; }
@compute @workgroup_size(64) fn probe_main(@builtin(global_invocation_id) id: vec3u) {
    bodies[id.x].v = scale_of() * params.k;
}
`,
});

async function readyDeclared(bindings: ConstructorParameters<typeof ProbeFlow>[1] = {}) {
    const s = await probeScene();
    let flow: ProbeFlow | undefined;
    s.scene.flows.register(
        () => {
            flow = new ProbeFlow(probeParams, {
                pipelines: [probePipeline({ shader: declaredShader, consumes: [] })],
                bindings: new Map([[params, probeParams]]),
                ...bindings,
            });
            return flow;
        },
        { type: 'ProbeFlow', phase: 'physics', bodyType: 'ProbeBody' },
    );
    return { ...s, flow: () => flow };
}

const bodiesBySlot = wgslResource({
    name: 'bodies',
    binding: { storage: 'read_write' },
    type: { schema: ProbeBodySchema, array: true },
    frequency: 'stage',
    provider: { slot: 'bodies' },
});
const liveBySlot = wgslResource({
    name: 'probe_live',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'stage',
    provider: { slot: 'bodies', part: 'live' },
});
const slotShader = wgslModule({
    name: 'probe_slot',
    requires: [cam, bodiesBySlot, liveBySlot, params],
    source: `
@compute @workgroup_size(64) fn probe_main(@builtin(global_invocation_id) id: vec3u) {
    if (probe_live[id.x >> 5u] == 0u) { return; }
    bodies[id.x].v = cam.scale * params.k;
}
`,
});

describe('Flow com recursos declarados (spec 031, T010)', () => {
    it('fornecedor por slot do Flow: o pool do bodyType e o bitset de vivos', async () => {
        const { scene, flow } = await readyDeclared({
            pipelines: [probePipeline({ shader: slotShader, consumes: [] })],
        });
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        scene.world.insert(new ProbeBody());
        expect(flow()?.lifecycle).toBe('ready');
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        const [stage] = p.groupsOf('stage');
        const entries = (stage.spec as BindGroupSpec).bindings;
        expect(entries[0]).toMatchObject({
            buffer: scene.resourceSystem.poolBufferSpec('ProbeBody'),
        });
        expect(entries[1]).toMatchObject({
            buffer: scene.resourceSystem.poolLiveBuffer('ProbeBody'),
        });
    });

    it('fornecedores resolvidos (consumer, pool, privado por objeto) e grupos por frequência', async () => {
        const { scene, flow } = await readyDeclared();
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        scene.world.insert(new ProbeBody());
        expect(flow()?.lifecycle).toBe('ready');
        const p = ready.mock.calls[0]![0].payload.bound.compute('main');
        expect(p.groupsOf('frame').map((g: { index: number }) => g.index)).toEqual([0]);
        expect(p.groupsOf('stage').map((g: { index: number }) => g.index)).toEqual([1]);
        expect(p.groupsOf('draw').map((g: { index: number }) => g.index)).toEqual([2]);
        expect(p.groupsOf('batch')).toEqual([]);
        const [frame] = p.groupsOf('frame');
        const [stage] = p.groupsOf('stage');
        const [draw] = p.groupsOf('draw');
        expect((frame.spec as BindGroupSpec).bindings[0]).toMatchObject({
            buffer: scene.resourceSystem.bufferOf(
                scene.world.rootOf(scene.world.queryBySchemaName('ProbeCam')[0]!)! as ProbeCam,
                'cam',
            ),
        });
        expect((stage.spec as BindGroupSpec).bindings[0]).toMatchObject({
            buffer: scene.resourceSystem.poolBufferSpec('ProbeBody'),
        });
        expect((draw.spec as BindGroupSpec).bindings[0]).toMatchObject({ buffer: probeParams });
    });

    it('recurso privado sem fonte → erro que pede ctx.bind', async () => {
        const { scene } = await readyDeclared({ bindings: new Map() });
        scene.world.insert(new ProbeCam());
        expect(() => scene.world.insert(new ProbeBody())).toThrow(
            /recurso privado 'params'.*'main'.*'ProbeFlow' sem fonte/,
        );
    });

    it('fornecedor ausente na cena → o pipeline espera (sem erro)', async () => {
        const { scene, flow } = await readyDeclared();
        scene.world.insert(new ProbeBody());
        expect(flow()?.lifecycle).not.toBe('ready');
    });
});
