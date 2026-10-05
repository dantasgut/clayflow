import { afterEach, describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { fakeResourceCore } from './helpers/fakeResourceCore';

const IntentSchema = new StructSchema('PolicyIntent', { value: FieldType.vec4f });
const OutputSchema = new StructSchema('PolicyOutput', { m: FieldType.mat4x4f });
const BodySchema = new StructSchema('PolicyBody', { pos: FieldType.vec4f });

class Policy extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = { value: [0, 0, 0, 0], pos: [0, 0, 0, 0] };
    constructor(private readonly descs: readonly GPUDescriptor[]) {
        super();
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return this.descs;
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, writes } = fakeResourceCore();
    new ResourceSystem(core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { world, writes, frame };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ResourceSystem — política de envio por descritor', () => {
    it("'always' (default) escreve na alocação e a cada sujo", () => {
        const { world, writes, frame } = setup();
        const r = new Policy([
            { id: 'i', role: 'storage-ro', storage: 'pool', schema: IntentSchema },
        ]);
        world.insert(r);
        expect(writes.length).toBe(1);
        (r.data.value as number[])[0] = 1;
        frame();
        expect(writes.length).toBe(2);
        expect(r.state).toBe(ResourceState.Ready);
    });

    it("'initial' escreve só na alocação, entra em GpuManaged e avisa uma vez por schema", () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { world, writes, frame } = setup();
        const desc: GPUDescriptor = {
            id: 'b',
            role: 'storage-rw',
            storage: 'pool',
            schema: BodySchema,
            upload: 'initial',
        };
        const a = new Policy([desc]);
        const b = new Policy([desc]);
        world.insert(a);
        world.insert(b);
        expect(writes.length).toBe(2);
        expect(a.state).toBe(ResourceState.GpuManaged);
        (a.data.pos as number[])[0] = 1;
        (b.data.pos as number[])[0] = 1;
        frame();
        expect(writes.length).toBe(2);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('PolicyBody');
    });

    it("'never' não escreve na alocação, no sujo nem no crescimento do pool", () => {
        const { world, writes, frame } = setup();
        const desc: GPUDescriptor = {
            id: 'o',
            role: 'storage-rw',
            storage: 'pool',
            schema: OutputSchema,
            upload: 'never',
        };
        const all: Policy[] = [];
        for (let i = 0; i < 40; i++) {
            const r = new Policy([desc]);
            all.push(r);
            world.insert(r);
        }
        (all[0]!.data.value as number[])[0] = 1;
        frame();
        expect(writes.length).toBe(0);
    });

    it("recurso misto ('always' + 'never') fica Ready e só o descritor 'always' é escrito", () => {
        const { world, writes, frame } = setup();
        const r = new Policy([
            { id: 'i', role: 'storage-ro', storage: 'pool', schema: IntentSchema },
            { id: 'o', role: 'storage-rw', storage: 'pool', schema: OutputSchema, upload: 'never' },
        ]);
        world.insert(r);
        expect(writes.length).toBe(1);
        expect(writes[0]!.bytes.byteLength).toBe(IntentSchema.stride);
        expect(r.state).toBe(ResourceState.Ready);
        (r.data.value as number[])[0] = 1;
        frame();
        expect(writes.length).toBe(2);
        expect(writes[1]!.bytes.byteLength).toBe(IntentSchema.stride);
    });
});
