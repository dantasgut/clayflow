// Spec 037 — canal temporal da C2 (`GPUDescriptor.history`; contrato `contracts/temporal-channel.md`).
import { describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { TemporalChannel } from '../systems/TemporalChannel';
import { World } from '../world/World';
import { fakeResourceCore } from './helpers/fakeResourceCore';
import { defaultCapabilities } from './helpers/defaultCapabilities';

const Energy = new StructSchema('ChannelEnergy', { total: FieldType.f32 });

class BagResource extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    constructor(private readonly descs: readonly GPUDescriptor[]) {
        super();
        this.data = {};
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return this.descs;
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup(features: readonly string[] = []) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    vi.mocked(fake.core.capabilities).mockImplementation(() => ({
        ...defaultCapabilities(),
        features: [...features] as GPUFeatureName[],
    }));
    const system = new ResourceSystem(fake.core, events, world);
    const frame = (elapsed: number): void => {
        events.emit('frameRecording', { elapsed });
    };
    return { events, world, system, frame, ...fake };
}

const historyTexture = (extra: Partial<GPUDescriptor> = {}): GPUDescriptor => ({
    id: 'history',
    role: 'storage-texture',
    textureShape: { format: 'rgba16float', sizeFromCanvas: true },
    history: { depth: 2 },
    ...extra,
});

describe('TemporalChannel', () => {
    it('depth precisa de ao menos duas fatias', () => {
        expect(() => new TemporalChannel('x', 1)).toThrow(/inteiro ≥ 2/);
        expect(() => new TemporalChannel('x', 2.5)).toThrow(/inteiro ≥ 2/);
    });

    it('atraso fora do anel é erro', () => {
        const c = new TemporalChannel('x', 3);
        c.replaceSlices([{}, {}, {}]);
        expect(() => c.slice(3)).toThrow(/atraso 3/);
        expect(() => c.slice(-1)).toThrow(/atraso -1/);
    });
});

describe('ResourceSystem — canal temporal de textura', () => {
    it('aloca depth texturas distintas; o anel só gira com gravação; atraso e carimbo', () => {
        const { world, system, frame } = setup();
        const r = new BagResource([historyTexture({ history: { depth: 3 } })]);
        world.insert(r);
        const ch = system.channelOf(r, 'history')!;
        expect(ch.depth).toBe(3);
        const slices = [0, 1, 2].map((k) => ch.texture(k)!);
        expect(new Set(slices).size).toBe(3);
        expect(slices.map((t) => t.width)).toEqual([800, 800, 800]);
        expect(ch.frames).toBe(0);

        // Sem gravação: não gira.
        frame(0.1);
        expect(ch.head).toBe(0);
        expect(ch.frames).toBe(0);

        // Grava no quadro 2 (elapsed 0.2): no início do quadro seguinte, a fatia gravada vira o atraso 1.
        frame(0.2);
        const written = ch.texture(0);
        system.markWritten(r, 'history');
        expect(ch.stamp(0)).toEqual({ frame: 2, elapsed: 0.2 });
        frame(0.3);
        expect(ch.frames).toBe(1);
        expect(ch.texture(1)).toBe(written);
        expect(ch.stamp(1)).toEqual({ frame: 2, elapsed: 0.2 });
        expect(ch.stamp(0)).toBeUndefined();
        expect(ch.stamp(2)).toBeUndefined();

        system.markWritten(r, 'history');
        frame(0.4);
        expect(ch.frames).toBe(2);
        expect(ch.texture(2)).toBe(written);
        expect(ch.stamp(2)).toEqual({ frame: 2, elapsed: 0.2 });
        expect(ch.stamp(1)).toEqual({ frame: 3, elapsed: 0.3 });
        // Idade: a anterior gravada no quadro imediatamente anterior tem 1; um quadro sem gravação a envelhece.
        expect(ch.age(1)).toBe(1);
        expect(ch.age(2)).toBe(2);
        frame(0.5);
        expect(ch.age(1)).toBe(2);
    });

    it('redimensionar recria as fatias e invalida a série', () => {
        const { world, system, frame, events } = setup();
        const r = new BagResource([historyTexture()]);
        world.insert(r);
        const ch = system.channelOf(r, 'history')!;
        system.markWritten(r, 'history');
        frame(0.1);
        expect(ch.frames).toBe(1);
        const epoch = ch.epoch;
        events.emit('canvasReconfigured', { width: 320, height: 200, format: 'bgra8unorm' });
        expect(ch.frames).toBe(0);
        expect(ch.epoch).toBe(epoch + 1);
        expect(ch.texture(0)!.width).toBe(320);
        expect(ch.texture(1)!.width).toBe(320);
        expect(ch.texture(0)).not.toBe(ch.texture(1));
    });

    it('invalidateChannel: o pedido do produtor', () => {
        const { world, system, frame } = setup();
        const r = new BagResource([historyTexture()]);
        world.insert(r);
        system.markWritten(r, 'history');
        frame(0.1);
        system.invalidateChannel(r, 'history');
        expect(system.channelOf(r, 'history')!.frames).toBe(0);
    });

    it("precisão 'full': 32 bits; lido filtrado sem float32-filterable recua para 16 com um aviso", () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const full = { depth: 2, precision: 'full' } as const;
            const a = setup();
            const plain = new BagResource([historyTexture({ history: full })]);
            a.world.insert(plain);
            expect(a.system.channelOf(plain, 'history')!.format).toBe('rgba32float');

            const filtered = new BagResource([
                historyTexture({ history: { ...full, filtered: true } }),
            ]);
            a.world.insert(filtered);
            expect(a.system.channelOf(filtered, 'history')!.format).toBe('rgba16float');
            expect(warn).toHaveBeenCalledTimes(1);

            const b = setup(['float32-filterable']);
            const ok = new BagResource([historyTexture({ history: { ...full, filtered: true } })]);
            b.world.insert(ok);
            expect(b.system.channelOf(ok, 'history')!.format).toBe('rgba32float');
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });

    it('sob demanda: as fatias nascem no ensureAllocated', () => {
        const { world, system } = setup();
        const r = new BagResource([historyTexture({ allocation: 'onDemand' })]);
        world.insert(r);
        const ch = system.channelOf(r, 'history')!;
        expect(ch.allocated).toBe(false);
        expect(ch.texture(1)).toBeUndefined();
        system.ensureAllocated(r, 'history');
        expect(system.channelOf(r, 'history')).toBe(ch);
        expect(ch.allocated).toBe(true);
        expect(ch.texture(1)).toBeDefined();
    });
});

describe('ResourceSystem — canal temporal de buffer individual', () => {
    it('depth buffers de storage do tamanho do descritor; liberados com o recurso', () => {
        const { world, system, frame, core } = setup();
        const r = new BagResource([
            {
                id: 'records',
                role: 'storage-rw',
                schema: Energy,
                count: 10,
                upload: 'never',
                allocation: 'onDemand',
                history: { depth: 2 },
            },
        ]);
        world.insert(r);
        system.ensureAllocated(r, 'records');
        const ch = system.channelOf(r, 'records')!;
        const [a, b] = [ch.buffer(0)!, ch.buffer(1)!];
        expect(a).not.toBe(b);
        expect(a.byteSize).toBe(Math.ceil((Energy.stride * 10) / 16) * 16);
        system.markWritten(r, 'records');
        frame(0.1);
        expect(ch.buffer(1)).toBe(a);
        world.remove(r);
        expect(core.destroy).toHaveBeenCalledWith(a);
        expect(core.destroy).toHaveBeenCalledWith(b);
    });

    it('history em uniform é erro', () => {
        const { world } = setup();
        const Params = new StructSchema(
            'ChannelParams',
            { k: FieldType.vec4f },
            { addressSpace: 'uniform' },
        );
        expect(() =>
            world.insert(
                new BagResource([
                    { id: 'p', role: 'uniform', schema: Params, history: { depth: 2 } },
                ]),
            ),
        ).toThrow(/history em 'uniform'/);
    });
});

describe('ResourceSystem — canal temporal de pool', () => {
    const poolDesc: GPUDescriptor = {
        id: 'energy',
        role: 'storage-rw',
        storage: 'pool',
        schema: Energy,
        upload: 'never',
        allocation: 'onDemand',
        history: { depth: 3 },
    };

    it('N buffers do pool no pedido; giro com markPoolWritten; entrada no pool invalida', () => {
        const { world, system, frame } = setup();
        const a = new BagResource([poolDesc]);
        world.insert(a);
        system.ensurePoolAllocated('ChannelEnergy');
        const ch = system.channelOfPool('ChannelEnergy')!;
        const buffers = [0, 1, 2].map((k) => ch.buffer(k)!);
        expect(new Set(buffers).size).toBe(3);
        const capacity = system.poolInfo('ChannelEnergy')!.capacity;
        for (const b of buffers) expect(b.byteSize).toBe(Energy.stride * capacity);

        system.markPoolWritten('ChannelEnergy');
        frame(0.1);
        expect(ch.frames).toBe(1);
        world.insert(new BagResource([poolDesc]));
        expect(ch.frames).toBe(0);
    });

    it('crescer o pool recria as fatias com a capacidade nova', () => {
        const { world, system } = setup();
        world.insert(new BagResource([poolDesc]));
        system.ensurePoolAllocated('ChannelEnergy');
        const ch = system.channelOfPool('ChannelEnergy')!;
        const epoch = ch.epoch;
        for (let i = 0; i < 40; i++) world.insert(new BagResource([poolDesc]));
        const capacity = system.poolInfo('ChannelEnergy')!.capacity;
        expect(capacity).toBeGreaterThanOrEqual(41);
        expect(ch.epoch).toBeGreaterThan(epoch);
        for (let k = 0; k < 3; k++) expect(ch.buffer(k)!.byteSize).toBe(Energy.stride * capacity);
    });

    it('pool com history e envio da CPU é erro', () => {
        const { world } = setup();
        expect(() =>
            world.insert(new BagResource([{ ...poolDesc, upload: 'always', allocation: 'eager' }])),
        ).toThrow(/upload: 'never'/);
    });
});
