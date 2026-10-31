/**
 * Uniforme por região (spec 039, FR-014): `count` regiões alinhadas ao `minUniformBufferOffsetAlignment` do adaptador
 * num buffer próprio, o registro `i` de `data[id]` na região `i`, a fonte com offset dinâmico, a capacidade pela
 * redescrição (crescer e encolher) e as formas recusadas.
 */
import { describe, expect, it } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { sourceOfDescriptor } from '../consumers/strategies/sourceOfDescriptor';
import { memoryCore } from './helpers/memoryCore';

const StepParams = new StructSchema(
    'StepParams',
    { dt: FieldType.f32, step: FieldType.u32 },
    { addressSpace: 'uniform' },
);

interface StepData {
    params: { dt: number; step: number }[];
    [key: string]: unknown;
}

class Steps extends Entity<StepData> implements Resource {
    state = ResourceState.Uninitialized;
    constructor(
        private regions: number,
        private readonly extra: Partial<GPUDescriptor> = {},
    ) {
        super();
        this.data = { params: [] };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'params',
                role: 'uniform',
                schema: StepParams,
                regions: { count: this.regions },
                ...this.extra,
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
    /** A capacidade pela redescrição (como o `reserve` do `FluidField`). */
    resize(regions: number): void {
        const previous = this.getDescriptors();
        this.regions = regions;
        this.redescribe(previous, { ...this.data });
    }
}

function setup(alignment = 256) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core, bytesOf } = memoryCore();
    const limits = core.capabilities().limits;
    (core.capabilities as unknown as { mockReturnValue(v: unknown): void }).mockReturnValue({
        ...core.capabilities(),
        limits: { ...limits, minUniformBufferOffsetAlignment: alignment },
    });
    const resources = new ResourceSystem(core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { world, resources, frame, core, bytesOf };
}

describe('uniforme por região (spec 039)', () => {
    it('aloca count regiões no stride alinhado ao adaptador', () => {
        const s = setup(256);
        const steps = new Steps(4);
        s.world.insert(steps);
        s.frame();
        expect(s.resources.regionStrideOf(steps, 'params')).toBe(256);
        expect(s.resources.bufferOf(steps, 'params')?.byteSize).toBe(4 * 256);
    });

    it('o alinhamento vem do adaptador, não de um valor fixo', () => {
        const s = setup(64);
        const steps = new Steps(3);
        s.world.insert(steps);
        s.frame();
        expect(s.resources.regionStrideOf(steps, 'params')).toBe(64);
        expect(s.resources.bufferOf(steps, 'params')?.byteSize).toBe(3 * 64);
    });

    it('o registro i vai na região i, e a mutação de uma região reenvia no quadro', () => {
        const s = setup(256);
        const steps = new Steps(3);
        s.world.insert(steps);
        steps.data.params[0] = { dt: 0.5, step: 7 };
        steps.data.params[2] = { dt: 0.25, step: 9 };
        s.frame();
        const bytes = s.bytesOf(s.resources.bufferOf(steps, 'params')!);
        const f32 = new Float32Array(bytes.buffer);
        const u32 = new Uint32Array(bytes.buffer);
        expect([f32[0], u32[1]]).toEqual([0.5, 7]);
        expect([f32[512 / 4], u32[512 / 4 + 1]]).toEqual([0.25, 9]);
        expect(u32[256 / 4]).toBe(0);
        steps.data.params[1] = { dt: 2, step: 3 };
        s.frame();
        expect([f32[256 / 4], u32[256 / 4 + 1]]).toEqual([2, 3]);
    });

    it('a fonte sai com offset dinâmico: uma região do schema por ligação', () => {
        const s = setup(256);
        const steps = new Steps(2);
        s.world.insert(steps);
        s.frame();
        const source = sourceOfDescriptor(s.resources, steps, 'params');
        expect(source).toMatchObject({
            kind: 'buffer',
            size: StepParams.stride,
            dynamic: { stride: 256 },
        });
    });

    it('a redescrição cresce e encolhe o buffer, e o antigo é liberado', () => {
        const s = setup(256);
        const steps = new Steps(2);
        s.world.insert(steps);
        s.frame();
        const first = s.resources.bufferOf(steps, 'params')!;
        steps.resize(8);
        s.frame();
        const grown = s.resources.bufferOf(steps, 'params')!;
        expect(grown.byteSize).toBe(8 * 256);
        expect(s.core.destroy).toHaveBeenCalledWith(first);
        steps.resize(2);
        s.frame();
        const shrunk = s.resources.bufferOf(steps, 'params')!;
        expect(shrunk.byteSize).toBe(2 * 256);
        expect(s.core.destroy).toHaveBeenCalledWith(grown);
    });

    it('recusa regions fora de uniform individual, com count ou com número inválido', () => {
        for (const extra of [{ role: 'storage-rw' as const }, { count: 2 }]) {
            const s = setup();
            expect(() => {
                s.world.insert(new Steps(2, extra));
                s.frame();
            }).toThrow(/regions/);
        }
        const s = setup();
        expect(() => {
            s.world.insert(new Steps(0));
            s.frame();
        }).toThrow(/regiões/);
    });
});
