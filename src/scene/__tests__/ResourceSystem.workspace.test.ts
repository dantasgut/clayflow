/**
 * O espaço de trabalho pelo mecanismo da C2 (spec 039, plan D8): o trabalho por entidade como descritor de pool do
 * próprio corpo (no mesmo slot do `body`, `upload: 'never'`, `allocation: 'onDemand'`), crescendo com o pool e
 * reaproveitando faixas; o trabalho de domínio como descritor próprio com `count`, que a redescrição cresce, encolhe e
 * cresce de novo sem estado preso; e a leitura sob demanda pelo `ResourceDirectory` que os Flows recebem.
 */
import { describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { memoryCore } from './helpers/memoryCore';

const Particle = new StructSchema('WsParticle', { x: FieldType.vec4f });
const ParticleDelta = new StructSchema('WsParticleDelta', { d: FieldType.vec4f });
const Cell = new StructSchema('WsCell', { n: FieldType.u32 });

/** Um corpo de `count` partículas com o trabalho por partícula no mesmo slot. */
class Body extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(private readonly count: number) {
        super();
        this.data = { body: Array.from({ length: count }, () => ({ x: [0, 0, 0, 1] })) };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: Particle,
                storage: 'pool',
                upload: 'initial',
                count: this.count,
            },
            {
                id: 'delta',
                role: 'storage-rw',
                schema: ParticleDelta,
                storage: 'pool',
                upload: 'never',
                allocation: 'onDemand',
                count: this.count,
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

/** Um domínio com células por capacidade (como o `FluidField`). */
class Domain extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(private cells: number) {
        super();
        this.data = {};
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'cells', role: 'storage-rw', schema: Cell, upload: 'never', count: this.cells },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
    reserve(cells: number): void {
        const previous = this.getDescriptors();
        this.cells = cells;
        this.redescribe(previous, { ...this.data });
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    return { world, resources, frame, core, events };
}

describe('espaço de trabalho por entidade: o pool do corpo (spec 039)', () => {
    it('o trabalho ocupa a mesma faixa do body e só aloca quando pedido', () => {
        const s = setup();
        const a = new Body(3);
        const b = new Body(5);
        s.world.insert(a);
        s.world.insert(b);
        s.frame();
        for (const body of [a, b]) {
            const id = s.world.entityIdOfResource(body)!;
            expect(s.resources.poolRangeOf(ParticleDelta.name, id)).toEqual(
                s.resources.poolRangeOf(Particle.name, id),
            );
        }
        expect(s.resources.poolInfo(ParticleDelta.name)?.allocated).toBe(false);
        const buffer = s.resources.ensurePoolAllocated(ParticleDelta.name)!;
        const info = s.resources.poolInfo(ParticleDelta.name)!;
        expect(info.allocated).toBe(true);
        expect(buffer.byteSize).toBeGreaterThanOrEqual(8 * ParticleDelta.stride);
    });

    it('cresce com o pool e reaproveita a faixa de quem saiu', () => {
        const s = setup();
        const bodies = Array.from({ length: 4 }, () => new Body(100));
        for (const b of bodies) s.world.insert(b);
        s.frame();
        s.resources.ensurePoolAllocated(ParticleDelta.name);
        const before = s.resources.poolInfo(ParticleDelta.name)!;
        const big = new Body(1000);
        s.world.insert(big);
        s.frame();
        const grown = s.resources.poolInfo(ParticleDelta.name)!;
        expect(grown.capacity).toBeGreaterThanOrEqual(1400);
        expect(grown.generation).toBeGreaterThan(before.generation);
        const freedRange = s.resources.poolRangeOf(
            Particle.name,
            s.world.entityIdOfResource(bodies[1]!)!,
        )!;
        s.world.remove(bodies[1]!);
        s.frame();
        const again = new Body(100);
        s.world.insert(again);
        s.frame();
        const id = s.world.entityIdOfResource(again)!;
        expect(s.resources.poolRangeOf(ParticleDelta.name, id)).toEqual(freedRange);
        expect(s.resources.poolInfo(ParticleDelta.name)!.capacity).toBe(grown.capacity);
    });
});

describe('espaço de trabalho de domínio: descritor próprio com reserve (spec 039)', () => {
    it('cresce, encolhe e cresce de novo: o mesmo tamanho, o antigo liberado, a recomposição anunciada', () => {
        const s = setup();
        const domain = new Domain(64);
        s.world.insert(domain);
        s.frame();
        const replaced: unknown[] = [];
        s.events.on('entitiesRecomposed', (e) => replaced.push(e));
        const sizes: number[] = [];
        const buffers = [s.resources.bufferOf(domain, 'cells')!];
        for (const cells of [1024, 64, 1024]) {
            domain.reserve(cells);
            s.frame();
            const buffer = s.resources.bufferOf(domain, 'cells')!;
            sizes.push(buffer.byteSize);
            expect(s.core.destroy).toHaveBeenCalledWith(buffers.at(-1));
            buffers.push(buffer);
        }
        expect(sizes).toEqual([1024, 64, 1024].map((c) => Math.ceil((c * Cell.stride) / 16) * 16));
        expect(sizes[0]).toBe(sizes[2]);
        expect(replaced.length).toBeGreaterThanOrEqual(3);
    });
});

describe('leitura pelo ResourceDirectory dos Flows (spec 039)', () => {
    it('um contador de domínio é lido pelo contrato que o Flow recebe', async () => {
        const s = setup();
        const domain = new Domain(2);
        s.world.insert(domain);
        s.frame();
        const dir: ResourceDirectory = s.resources;
        const value = await dir.read(domain, 'cells');
        expect(value).toBeDefined();
    });
});

const Word = new StructSchema('WsWord', { w: FieldType.u32 });

/** Um Resource de trabalho cujas partes chegam depois (descritores trocados por `setParts`). */
class Parts extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(private descs: readonly GPUDescriptor[]) {
        super();
        this.data = {};
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return this.descs;
    }
    getPipelineDescriptors() {
        return [];
    }
    setParts(parts: readonly GPUDescriptor[]): void {
        const previous = this.descs;
        this.descs = parts;
        this.redescribe(previous, { ...this.data });
    }
}

describe('envio dos próprios e posse da GPU de um Resource de trabalho (spec 039)', () => {
    it('entrou só com dado da GPU (GpuManaged) e ganhou dado da CPU: a mutação passa a valer', () => {
        const s = setup();
        const gpu: GPUDescriptor = {
            id: 'scratch',
            role: 'storage-rw',
            schema: Word,
            upload: 'never',
            count: 4,
        };
        const work = new Parts([gpu]);
        s.world.insert(work);
        s.frame();
        expect(work.state).toBe(ResourceState.GpuManaged);
        work.setParts([gpu, { id: 'map', role: 'storage-ro', schema: Word, count: 4 }]);
        expect(work.state).toBe(ResourceState.Ready);
        work.data.map = new Uint32Array([1, 2, 3, 4]);
        s.frame();
        const map = s.resources.bufferOf(work, 'map')!;
        const writes = vi.mocked(s.core.write).mock.calls.filter(([spec]) => spec === map);
        expect(writes.length).toBeGreaterThan(0);
    });

    it('mudar o conteúdo de um descritor não reenvia os outros do mesmo Resource', () => {
        const s = setup();
        const work = new Parts([
            { id: 'a', role: 'storage-ro', schema: Word, count: 4 },
            { id: 'b', role: 'storage-ro', schema: Word, count: 4 },
        ]);
        work.data.a = new Uint32Array(4);
        work.data.b = new Uint32Array(4);
        s.world.insert(work);
        s.frame();
        const a = s.resources.bufferOf(work, 'a')!;
        const b = s.resources.bufferOf(work, 'b')!;
        vi.mocked(s.core.write).mockClear();
        work.data.a = new Uint32Array([9, 9, 9, 9]);
        s.frame();
        const written = vi.mocked(s.core.write).mock.calls.map(([spec]) => spec);
        expect(written).toContain(a);
        expect(written).not.toContain(b);
    });
});
