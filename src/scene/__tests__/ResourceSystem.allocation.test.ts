import { describe, expect, it, vi } from 'vitest';
import { Entity } from '../contracts/Entity';
import { ResourceState } from '../contracts/ResourceState';
import type { Resource } from '../contracts/Resource';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import { FieldType } from '../descriptors/FieldType';
import { StructSchema } from '../descriptors/StructSchema';
import { DefaultEventBus } from '../events/DefaultEventBus';
import { SetCountSchema } from '../graph/SetCountSchema';
import { ResourceSystem } from '../systems/ResourceSystem';
import { World } from '../world/World';
import { fakeResourceCore } from './helpers/fakeResourceCore';
import type {
    IndexBufferSpec,
    IndirectBufferSpec,
    StagingBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
    VertexBufferSpec,
} from '../../core/contracts/index';

const Vertex = new StructSchema('AllocVertex', {
    position: FieldType.vec3f,
    normal: FieldType.vec3f,
    uv: FieldType.vec2f,
});
const Params = new StructSchema('AllocParams', { scale: FieldType.f32, offset: FieldType.vec3f });
const Item = new StructSchema('AllocItem', { value: FieldType.vec4f });

class BagResource extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    constructor(
        private readonly descs: readonly GPUDescriptor[],
        data: Record<string, unknown> = {},
    ) {
        super();
        this.data = data;
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return this.descs;
    }
    getPipelineDescriptors() {
        return [];
    }
}

/** Recurso de capacidade variável: os descritores seguem `data.capacity` (como `RayScene`/`FluidField`). */
class GrowingResource extends Entity<{ capacity: number }> implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    constructor() {
        super();
        this.data = { capacity: 4 };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'cells',
                role: 'storage-rw',
                schema: Item,
                count: this.rawData.capacity,
                upload: 'never',
            },
            { id: 'fixed', role: 'storage-rw', schema: Item, count: 2, upload: 'never' },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
    grow(capacity: number): void {
        this.redescribe(this.getDescriptors(), { capacity });
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const system = new ResourceSystem(fake.core, events, world);
    return { events, world, system, ...fake };
}

const writesTo = (writes: ReturnType<typeof fakeResourceCore>['writes'], spec: unknown) =>
    writes.filter((w) => w.spec === spec);

describe('ResourceSystem — alocação da bag inteira (R9)', () => {
    it('vertex: stride do layout compacto, conteúdo de data[id]', () => {
        const { world, system, writes } = setup();
        const vertices = new Float32Array(3 * 8).fill(1);
        const r = new BagResource([{ id: 'vertices', role: 'vertex', schema: Vertex, count: 3 }], {
            vertices,
        });
        world.insert(r);
        const vbo = system.bufferOf(r, 'vertices') as VertexBufferSpec;
        expect(vbo).toMatchObject({ subkind: 'vertex', stride: 32, count: 3, byteSize: 96 });
        const w = writesTo(writes, vbo);
        expect(w).toHaveLength(1);
        expect(w[0]!.bytes.byteLength).toBe(96);
    });

    it.each([
        ['Uint16Array', new Uint16Array([0, 1, 2]), 'uint16', 8],
        ['Uint32Array', new Uint32Array([0, 1, 2]), 'uint32', 12],
    ] as const)('index %s → format %s, padding a 4 bytes', (_n, indices, format, byteSize) => {
        const { world, system, writes } = setup();
        const r = new BagResource([{ id: 'indices', role: 'index', count: 3 }], { indices });
        world.insert(r);
        const ibo = system.bufferOf(r, 'indices') as IndexBufferSpec;
        expect(ibo).toMatchObject({ subkind: 'index', format, count: 3, byteSize });
        const w = writesTo(writes, ibo);
        expect(w).toHaveLength(1);
        expect(w[0]!.bytes.byteLength % 4).toBe(0);
    });

    it('indirect, staging, sampler, texture e storage-texture alocados e localizáveis', () => {
        const { world, system, core } = setup();
        const r = new BagResource([
            { id: 'args', role: 'indirect', count: 2 },
            { id: 'readback', role: 'staging', schema: Item, count: 4 },
            { id: 'linear', role: 'sampler', samplerShape: { magFilter: 'linear' } },
            {
                id: 'albedo',
                role: 'texture',
                textureShape: { format: 'rgba8unorm', width: 16, height: 8 },
            },
            {
                id: 'field',
                role: 'storage-texture',
                textureShape: { format: 'rgba16float', width: 4, height: 4, access: 'write-only' },
            },
        ]);
        world.insert(r);
        expect(system.bufferOf(r, 'args') as IndirectBufferSpec).toMatchObject({
            subkind: 'indirect',
            byteSize: 40,
        });
        expect(system.bufferOf(r, 'readback') as StagingBufferSpec).toMatchObject({
            subkind: 'staging',
            byteSize: 64,
        });
        expect(system.samplerOf(r, 'linear')!).toMatchObject({
            kind: 'sampler',
            desc: { magFilter: 'linear' },
        });
        const albedo = system.textureOf(r, 'albedo')!;
        expect(albedo).toMatchObject({ width: 16, height: 8, format: 'rgba8unorm' });
        expect(albedo.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
        expect(system.textureViewOf(r, 'albedo')?.source).toBe(albedo);
        const field = system.textureOf(r, 'field')!;
        expect(field.usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
        expect(vi.mocked(core.create).mock.calls.length).toBeGreaterThanOrEqual(7);
    });

    it('indirect com schema: registros do tamanho do schema (contagem e argumentos juntos, SetCount)', () => {
        const { world, system } = setup();
        const r = new BagResource([
            { id: 'counts', role: 'indirect', schema: SetCountSchema, count: 2, upload: 'never' },
        ]);
        world.insert(r);
        expect(system.bufferOf(r, 'counts') as IndirectBufferSpec).toMatchObject({
            subkind: 'indirect',
            byteSize: 2 * SetCountSchema.stride,
        });
    });

    it('redescribe: descritor próprio que mudou de forma é realocado (o antigo destruído); os iguais ficam', () => {
        const { world, system, core } = setup();
        const r = new GrowingResource();
        world.insert(r);
        const cells = system.bufferOf(r, 'cells')!;
        const fixed = system.bufferOf(r, 'fixed')!;
        expect(cells.byteSize).toBe(4 * Item.stride);
        r.grow(16);
        const grown = system.bufferOf(r, 'cells')!;
        expect(grown).not.toBe(cells);
        expect(grown.byteSize).toBe(16 * Item.stride);
        expect(system.bufferOf(r, 'fixed')).toBe(fixed);
        expect(vi.mocked(core.destroy)).toHaveBeenCalledWith(cells);
        expect(vi.mocked(core.destroy)).not.toHaveBeenCalledWith(fixed);
    });

    it('texture sizeFromCanvas usa o canvas e é recriada no resize (anterior destruída)', () => {
        const { world, system, events, core } = setup();
        const r = new BagResource([
            {
                id: 'target',
                role: 'texture',
                textureShape: { format: 'rgba8unorm', sizeFromCanvas: true },
            },
        ]);
        world.insert(r);
        const first = system.textureOf(r, 'target')!;
        const firstView = system.textureViewOf(r, 'target')!;
        expect(first).toMatchObject({ width: 800, height: 600 });
        events.emit('canvasReconfigured', { width: 1024, height: 512, format: 'bgra8unorm' });
        const second = system.textureOf(r, 'target')!;
        expect(second).toMatchObject({ width: 1024, height: 512 });
        expect(core.destroy).toHaveBeenCalledWith(firstView);
        expect(core.destroy).toHaveBeenCalledWith(first);
    });

    it('ensurePool cria o pool vazio uma vez, avisa poolCreated e o recurso que chega depois usa o mesmo', () => {
        const { world, system, events } = setup();
        const schema = new StructSchema('Lamp', {
            power: FieldType.f32,
            _p0: FieldType.f32,
            _p1: FieldType.f32,
            _p2: FieldType.f32,
        });
        const created: string[] = [];
        events.on('poolCreated', (e) => created.push(e.poolKey));
        system.ensurePool(schema);
        system.ensurePool(schema);
        expect(created).toEqual(['Lamp']);
        const info = system.poolInfo('Lamp')!;
        expect(info.count).toBe(0);
        const r = new BagResource([{ id: 'lamp', role: 'storage-ro', storage: 'pool', schema }]);
        world.insert(r);
        expect(system.poolInfo('Lamp')!.count).toBe(1);
        expect(created).toEqual(['Lamp']);
    });

    it("pool 'onDemand' (spec 037): um elemento até o pedido, conta e cresce sem realocar; o pedido aloca a capacidade e avisa", () => {
        const { world, system, events } = setup();
        const realloc: number[] = [];
        events.on('poolReallocated', (e) => realloc.push(e.newByteSize));
        const desc: GPUDescriptor = {
            id: 'inverse',
            role: 'storage-rw',
            storage: 'pool',
            schema: Item,
            upload: 'never',
            allocation: 'onDemand',
        };
        const all = Array.from({ length: 70 }, () => new BagResource([desc]));
        for (const r of all) world.insert(r);
        const info = system.poolInfo('AllocItem')!;
        expect(info.count).toBe(70);
        expect(info.buffer.byteSize).toBe(Item.stride);
        expect(realloc).toEqual([]);
        const buffer = system.ensurePoolAllocated('AllocItem')!;
        expect(buffer.byteSize).toBe(Item.stride * system.poolInfo('AllocItem')!.capacity);
        expect(system.poolInfo('AllocItem')!.capacity).toBeGreaterThanOrEqual(70);
        expect(realloc).toEqual([buffer.byteSize]);
        // Já alocado: o mesmo buffer, sem aviso.
        expect(system.ensurePoolAllocated('AllocItem')).toBe(buffer);
        expect(realloc).toHaveLength(1);
        expect(system.ensurePoolAllocated('Inexistente')).toBeUndefined();
    });

    it("pool 'onDemand' com envio da CPU é erro (só pools produzidos pela GPU)", () => {
        const { world } = setup();
        const r = new BagResource([
            {
                id: 'x',
                role: 'storage-ro',
                storage: 'pool',
                schema: Params,
                allocation: 'onDemand',
            },
        ]);
        expect(() => world.insert(r)).toThrow(/sob demanda/);
    });

    it('canvasDivisor: uma fração do canvas, arredondada para cima, também ao recriar no resize', () => {
        const { world, system, events } = setup();
        const r = new BagResource([
            {
                id: 'tiles',
                role: 'storage-texture',
                textureShape: { format: 'rgba16float', sizeFromCanvas: true, canvasDivisor: 8 },
            },
        ]);
        world.insert(r);
        expect(system.textureOf(r, 'tiles')).toMatchObject({ width: 100, height: 75 });
        events.emit('canvasReconfigured', { width: 1001, height: 7, format: 'bgra8unorm' });
        expect(system.textureOf(r, 'tiles')).toMatchObject({ width: 126, height: 1 });
    });

    it("format 'canvas' resolve para o formato do canvas, também ao recriar no resize", () => {
        const { world, system, events } = setup();
        const r = new BagResource([
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: 'canvas', sizeFromCanvas: true },
            },
        ]);
        world.insert(r);
        expect(system.textureOf(r, 'color')?.format).toBe('bgra8unorm');
        expect(system.textureViewOf(r, 'color')?.format).toBe('bgra8unorm');
        events.emit('canvasReconfigured', { width: 64, height: 32, format: 'bgra8unorm' });
        expect(system.textureOf(r, 'color')).toMatchObject({ format: 'bgra8unorm', width: 64 });
    });

    it('uso derivado do formato: profundidade é anexo + amostrável, sem cópia; cor também copiável', () => {
        const { world, system } = setup();
        const U = GPUTextureUsage;
        const r = new BagResource([
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth32float', width: 4, height: 4 },
            },
            {
                id: 'color',
                role: 'texture',
                textureShape: { format: 'rgba8unorm', width: 4, height: 4 },
            },
        ]);
        world.insert(r);
        expect(system.textureOf(r, 'depth')?.usage).toBe(U.RENDER_ATTACHMENT | U.TEXTURE_BINDING);
        expect(system.textureOf(r, 'color')?.usage).toBe(
            U.TEXTURE_BINDING | U.COPY_DST | U.COPY_SRC | U.RENDER_ATTACHMENT,
        );
    });

    it('uniform e storage individuais: storage com count 3 envia os 3 elementos', () => {
        const { world, system, writes } = setup();
        const r = new BagResource(
            [
                { id: 'params', role: 'uniform', schema: Params },
                { id: 'items', role: 'storage-ro', schema: Item, count: 3 },
            ],
            {
                scale: 2,
                offset: [1, 2, 3],
                items: [{ value: [1, 0, 0, 0] }, { value: [2, 0, 0, 0] }, { value: [3, 0, 0, 0] }],
            },
        );
        world.insert(r);
        const ubo = system.bufferOf(r, 'params') as UniformBufferSpec;
        const ssbo = system.bufferOf(r, 'items') as StorageBufferSpec;
        expect(ubo.byteSize).toBe(32);
        expect(ssbo.byteSize).toBe(48);
        const w = writesTo(writes, ssbo);
        expect(w).toHaveLength(1);
        const f = new Float32Array(w[0]!.bytes.buffer, w[0]!.bytes.byteOffset, 12);
        expect([f[0], f[4], f[8]]).toEqual([1, 2, 3]);
    });

    it('dois descritores uniform no mesmo recurso → dois buffers, ambos destruídos na remoção', () => {
        const { world, system, core } = setup();
        const r = new BagResource(
            [
                { id: 'a', role: 'uniform', schema: Params },
                { id: 'b', role: 'uniform', schema: Params },
            ],
            { scale: 1, offset: [0, 0, 0] },
        );
        world.insert(r);
        const a = system.bufferOf(r, 'a');
        const b = system.bufferOf(r, 'b');
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        expect(a).not.toBe(b);
        world.remove(r);
        expect(core.destroy).toHaveBeenCalledWith(a);
        expect(core.destroy).toHaveBeenCalledWith(b);
        expect(system.bufferOf(r, 'a')).toBeUndefined();
    });

    it('reatribuir data.vertices reenvia no frameRecording; tamanho novo recria o buffer', () => {
        const { world, system, writes, events, core } = setup();
        const r = new BagResource([{ id: 'vertices', role: 'vertex', schema: Vertex, count: 3 }], {
            vertices: new Float32Array(24),
        });
        world.insert(r);
        const vbo = system.bufferOf(r, 'vertices')!;
        r.data.vertices = new Float32Array(24).fill(2);
        events.emit('frameRecording', { elapsed: 0 });
        expect(writesTo(writes, vbo)).toHaveLength(2);
        r.data.vertices = new Float32Array(48);
        events.emit('frameRecording', { elapsed: 0 });
        const bigger = system.bufferOf(r, 'vertices') as VertexBufferSpec;
        expect(bigger).not.toBe(vbo);
        expect(bigger.count).toBe(6);
        expect(core.destroy).toHaveBeenCalledWith(vbo);
    });

    it('crescimento de pool destrói o buffer anterior (o pool não tem bind group próprio)', () => {
        const { world, system, core } = setup();
        const Pooled = new StructSchema('AllocPooled', { v: FieldType.vec4f });
        const make = () =>
            new BagResource([{ id: 'p', role: 'storage-rw', schema: Pooled, storage: 'pool' }], {
                v: [0, 0, 0, 0],
            });
        world.insert(make());
        const firstBuf = system.poolBufferSpec('AllocPooled')!;
        for (let i = 0; i < 16; i++) world.insert(make());
        expect(system.poolBufferSpec('AllocPooled')).not.toBe(firstBuf);
        expect(core.destroy).toHaveBeenCalledWith(firstBuf);
        expect(vi.mocked(core.create).mock.calls.some(([s]) => s.kind === 'bindgroup')).toBe(false);
    });

    it('descritor em pool não aparece em bufferOf (usa poolBufferSpec)', () => {
        const { world, system } = setup();
        const Pooled = new StructSchema('AllocPooled2', { v: FieldType.vec4f });
        const r = new BagResource(
            [{ id: 'p', role: 'storage-rw', schema: Pooled, storage: 'pool' }],
            {
                v: [0, 0, 0, 0],
            },
        );
        world.insert(r);
        expect(system.bufferOf(r, 'p')).toBeUndefined();
        expect(system.poolBufferSpec('AllocPooled2')).toBeDefined();
    });
});
