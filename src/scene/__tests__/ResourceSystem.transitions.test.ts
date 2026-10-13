import { afterEach, describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceStateHandlerRegistry } from '../lifecycle/ResourceStateHandlerRegistry';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { fakeResourceCore } from './helpers/fakeResourceCore';

const Body = new StructSchema('TransBody', { pos: FieldType.vec4f });

class Probe extends Entity implements Resource {
    data: Record<string, unknown> = { pos: [0, 0, 0, 1] };
    readonly history: ResourceState[] = [];
    private current: ResourceState = ResourceState.Uninitialized;
    constructor(private readonly descs: readonly GPUDescriptor[]) {
        super();
    }
    get state(): ResourceState {
        return this.current;
    }
    set state(next: ResourceState) {
        this.history.push(next);
        this.current = next;
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
    const fake = fakeResourceCore();
    const system = new ResourceSystem(fake.core, events, world);
    return { events, world, system, ...fake };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ResourceSystem — ciclo de vida validado (R10)', () => {
    it('inserção: Uninitialized → Loading → Ready, cada passo por transition()', () => {
        const { world, system } = setup();
        const p = new Probe([{ id: 'body', role: 'uniform', schema: Body }]);
        const spy = vi.spyOn(system, 'transition');
        world.insert(p);
        expect(p.history).toEqual([ResourceState.Loading, ResourceState.Ready]);
        expect(spy.mock.calls.map((c) => c[1])).toEqual([
            ResourceState.Loading,
            ResourceState.Ready,
        ]);
    });

    it('transição inválida lança com estado atual, destino e schema', () => {
        const { system } = setup();
        const p = new Probe([{ id: 'body', role: 'uniform', schema: Body }]);
        expect(() => {
            system.transition(p, ResourceState.Ready);
        }).toThrow(/uninitialized → ready.*TransBody/);
    });

    it('mutação e envio: Ready → Dirty → Ready', () => {
        const { world, events } = setup();
        const p = new Probe([{ id: 'body', role: 'uniform', schema: Body }]);
        world.insert(p);
        p.data.pos = [1, 2, 3, 1];
        events.emit('frameRecording', { elapsed: 0 });
        expect(p.history).toEqual([
            ResourceState.Loading,
            ResourceState.Ready,
            ResourceState.Dirty,
            ResourceState.Ready,
        ]);
    });

    it('GpuManaged: envio bloqueado por suppressCpuUpload() e aviso vindo do handler', () => {
        const { world, events, writes } = setup();
        const p = new Probe([
            { id: 'body', role: 'storage-rw', schema: Body, storage: 'pool', upload: 'initial' },
        ]);
        const registry = new ResourceStateHandlerRegistry();
        const handler = registry.get(ResourceState.GpuManaged);
        expect(handler.suppressCpuUpload()).toBe(true);
        expect(handler.reportsIgnoredMutation()).toBe(true);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        world.insert(p);
        expect(p.state).toBe(ResourceState.GpuManaged);
        p.data.pos = [9, 9, 9, 1];
        events.emit('frameRecording', { elapsed: 0 });
        // Só o dado do momento da inserção é enviado (uma vez); a mutação depois dela é ignorada com aviso.
        expect(writes).toHaveLength(1);
        expect(new Float32Array(writes[0]!.bytes.slice().buffer)[0]).not.toBe(9);
        const before = writes.length;
        p.data.pos = [8, 8, 8, 1];
        events.emit('frameRecording', { elapsed: 0 });
        expect(writes.length).toBe(before);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('Dirty ignora nova marcação sem aviso (já está na fila)', () => {
        const { world } = setup();
        const p = new Probe([{ id: 'body', role: 'uniform', schema: Body }]);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        world.insert(p);
        p.data.pos = [1, 1, 1, 1];
        p.data.pos = [2, 2, 2, 1];
        expect(warn).not.toHaveBeenCalled();
        expect(p.history.filter((s) => s === ResourceState.Dirty)).toHaveLength(1);
    });

    it('remover → reinserir: Disposed → Destroyed → Uninitialized → Loading → Ready com nova alocação', () => {
        const { world, system } = setup();
        const p = new Probe([{ id: 'body', role: 'uniform', schema: Body }]);
        world.insert(p);
        const first = system.bufferOf(p, 'body');
        world.remove(p);
        expect(p.state).toBe(ResourceState.Destroyed);
        expect(system.bufferOf(p, 'body')).toBeUndefined();
        world.insert(p);
        expect(p.history).toEqual([
            ResourceState.Loading,
            ResourceState.Ready,
            ResourceState.Disposed,
            ResourceState.Destroyed,
            ResourceState.Uninitialized,
            ResourceState.Loading,
            ResourceState.Ready,
        ]);
        const second = system.bufferOf(p, 'body');
        expect(second).toBeDefined();
        expect(second).not.toBe(first);
    });

    it('Destroyed → Uninitialized é transição válida no registro', () => {
        const registry = new ResourceStateHandlerRegistry();
        expect(registry.canTransition(ResourceState.Destroyed, ResourceState.Uninitialized)).toBe(
            true,
        );
    });
});
