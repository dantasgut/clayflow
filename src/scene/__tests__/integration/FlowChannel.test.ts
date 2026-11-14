// Spec 037 — canal temporal ligado a um Flow: `slot.channel`, provedor `{ slot, lag }`, bind group por fase do anel.
import { describe, expect, it } from 'vitest';
import type { BindGroupSpec, Frame, TextureViewSpec } from '../../../core/contracts/index';
import { Entity } from '../../contracts/Entity';
import { ResourceState } from '../../contracts/ResourceState';
import type { Resource } from '../../contracts/Resource';
import type { GPUDescriptor } from '../../descriptors/GPUDescriptor';
import { FieldType } from '../../descriptors/FieldType';
import { StructSchema } from '../../descriptors/StructSchema';
import { Flow } from '../../flows/Flow';
import type { BoundFlow, TransitionContext } from '../../flows/FlowBinding';
import type { FlowTransitions } from '../../flows/FlowTransitions';
import { slot } from '../../flows/slots';
import { wgslModule } from '../../shaders/WgslModule';
import { wgslResource } from '../../shaders/WgslResource';
import { probeScene } from '../helpers/probeFlow';

const HistorySchema = new StructSchema('ChannelHistory', { unused: FieldType.f32 });

class History extends Entity implements Resource {
    static readonly schema = HistorySchema;
    state: ResourceState = ResourceState.Uninitialized;
    constructor(private readonly depth = 2) {
        super();
        this.data = {};
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'color',
                role: 'storage-texture',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true },
                allocation: 'onDemand',
                history: { depth: this.depth },
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

const previous = wgslResource({
    name: 'previous',
    binding: { texture: { sample: 'f32' } },
    frequency: 'stage',
    provider: { slot: 'history', lag: 1 },
});
const current = wgslResource({
    name: 'current',
    binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
    frequency: 'stage',
    provider: { slot: 'history', lag: 0 },
});
const shader = wgslModule({
    name: 'channel_probe',
    requires: [previous, current],
    source: `
@compute @workgroup_size(8, 8) fn channel_main(@builtin(global_invocation_id) id: vec3u) {
    textureStore(current, id.xy, textureLoad(previous, id.xy, 0) + vec4f(1.0));
}
`,
});

const slots = { history: slot.channel(HistorySchema, 'color') };
type Slots = typeof slots;

class ChannelFlow extends Flow<Slots, 'idle'> {
    readonly type = 'ChannelFlow';
    readonly slots = slots;
    override readonly pipelines = [
        { id: 'main', role: 'compute' as const, shader, entryPoints: ['channel_main'] },
    ];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<Slots>> = {
        '*': {
            slotsResolved: { to: 'idle' },
            slotLost: { to: 'idle' },
            pipelinesCompiled: { to: 'idle' },
            bindGroupReplaced: { to: 'idle' },
        },
    };
    /** O grupo ligado em cada quadro gravado. */
    readonly groups: BindGroupSpec[] = [];
    write = true;

    dispatch(frame: Frame, bound: BoundFlow<Slots>): void {
        const p = bound.compute('main');
        frame.compute('ChannelFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.groups.forEach((g, i) => pass.bind.setBindGroup(i, g));
            pass.dispatch.workgroups(1, 1, 1);
        });
        this.groups.push(p.groups[0]!);
        if (this.write) bound.slots.history.written();
    }
}

async function setup(depth = 2) {
    const s = await probeScene();
    let flow: ChannelFlow | undefined;
    s.scene.flows.register(
        () => {
            flow = new ChannelFlow();
            return flow;
        },
        { type: 'ChannelFlow', phase: 'post' },
    );
    const history = new History(depth);
    s.scene.world.insert(history);
    // Quem usa o canal pede as fatias (descritor sob demanda).
    s.scene.resourceSystem.ensureAllocated(history, 'color');
    return { ...s, history, flow: () => flow! };
}

const viewOf = (group: BindGroupSpec, binding: number): TextureViewSpec | undefined => {
    const entry = group.bindings.find((b) => b.binding === binding);
    return entry?.kind === 'textureview' ? entry.view : undefined;
};

describe('canal temporal ligado a um Flow (spec 037)', () => {
    it('as fatias pedidas; a fatia lida (atraso 1) e a gravada (0) alternam a cada quadro', async () => {
        const { scene, frame, flow, history, counting } = await setup();
        frame();
        frame();
        frame();
        const ch = scene.resourceSystem.channelOf(history, 'color')!;
        expect(ch).toBeDefined();
        const [g1, g2, g3] = flow().groups;
        // `current` (0) e `previous` (1) em ordem alfabética: binding 0 = current, 1 = previous.
        expect(viewOf(g1!, 0)).toBe(viewOf(g2!, 1));
        expect(viewOf(g2!, 0)).toBe(viewOf(g3!, 1));
        expect(viewOf(g1!, 0)).not.toBe(viewOf(g1!, 1));
        // Duas fases, criadas uma vez: o quadro 3 volta ao bind group do 1.
        expect(g3).toBe(g1);
        expect(g2).not.toBe(g1);
        expect(ch.frames).toBe(2);
        expect(counting.stats().createdWhileRecording).toEqual([]);
    });

    it('sem gravação o anel não gira: o mesmo bind group', async () => {
        const { frame, flow } = await setup();
        frame();
        flow().write = false;
        frame();
        frame();
        const [, g2, g3] = flow().groups;
        expect(g3).toBe(g2);
    });

    it('redimensionar recria as fatias: as fontes mudam, as fases são refeitas e a série recomeça', async () => {
        const { scene, frame, flow, history } = await setup();
        frame();
        frame();
        const before = flow().groups.at(-1)!;
        scene.events.emit('canvasReconfigured', { width: 64, height: 32, format: 'bgra8unorm' });
        frame();
        const after = flow().groups.at(-1)!;
        expect(after).not.toBe(before);
        const ch = scene.resourceSystem.channelOf(history, 'color')!;
        // As fatias novas, já no quadro depois do redimensionamento; a série recomeçou (só a atual gravada).
        expect(viewOf(after, 0)).toBe(ch.view(0));
        expect(viewOf(after, 1)).toBe(ch.view(1));
        expect(ch.frames).toBe(0);
        expect(ch.stamp(0)).toBeDefined();
        expect(ch.stamp(1)).toBeUndefined();
    });

    it('profundidade 4: quatro fases, o atraso 1 sempre a fatia gravada no quadro anterior', async () => {
        const { frame, flow } = await setup(4);
        for (let i = 0; i < 6; i++) frame();
        const groups = flow().groups;
        for (let i = 1; i < groups.length; i++)
            expect(viewOf(groups[i]!, 1)).toBe(viewOf(groups[i - 1]!, 0));
        expect(new Set(groups).size).toBe(4);
        expect(groups[4]).toBe(groups[0]);
    });
});
