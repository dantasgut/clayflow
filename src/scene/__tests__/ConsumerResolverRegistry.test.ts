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
import {
    ConsumerResolverRegistry,
    ConsumerResolutionError,
} from '../consumers/ConsumerResolverRegistry';
import type { ConsumerResolver, ResolveContext } from '../consumers/ConsumerResolver';
import { SingletonResolver } from '../consumers/strategies/SingletonResolver';
import { PoolResolver } from '../consumers/strategies/PoolResolver';
import { TextureResolver } from '../consumers/strategies/TextureResolver';
import { fakeResourceCore } from './helpers/fakeResourceCore';

const Cam = new StructSchema('ResolverCam', { vp: FieldType.mat4x4f }, { addressSpace: 'uniform' });
const Item = new StructSchema('ResolverItem', { v: FieldType.vec4f }, { wgslName: 'Item' });
const Mat = new StructSchema(
    'ResolverMat',
    { albedo: FieldType.vec4f },
    { addressSpace: 'uniform' },
);

class Bag extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};
    constructor(
        private readonly descs: readonly GPUDescriptor[],
        readonly tag = '',
    ) {
        super();
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return this.descs;
    }
    getPipelineDescriptors() {
        return [];
    }
}

/** O World indexa entidades pelo `schema` estático da classe (como Camera, Light, ShadowMap). */
class CamBag extends Bag {
    static readonly schema = Cam;
}

function scene() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const consumers = new ConsumerResolverRegistry();
    const resources = new ResourceSystem(fakeResourceCore().core, events, world, consumers);
    const ctx: ResolveContext = { world, resources };
    return { world, resources, consumers, ctx };
}

const stub = (name: string): ConsumerResolver => ({
    name,
    typeName: name,
    resolve: () => undefined,
});

describe('ConsumerResolverRegistry', () => {
    it('register substitui; registerDefault não substitui', () => {
        const reg = new ConsumerResolverRegistry();
        const a = stub('X');
        const b = stub('X');
        expect(reg.registerDefault(a)).toBe(true);
        expect(reg.registerDefault(b)).toBe(false);
        expect(reg.get('X')).toBe(a);
        reg.register(b);
        expect(reg.get('X')).toBe(b);
    });

    it('nome não registrado lança listando os disponíveis', () => {
        const reg = new ConsumerResolverRegistry();
        reg.register(stub('Camera'));
        reg.register(stub('Time'));
        expect(() => reg.resolve('Light', scene().ctx)).toThrow(ConsumerResolutionError);
        expect(() => reg.resolve('Light', scene().ctx)).toThrow(/'Light'.*Camera, Time/);
    });
});

describe('SingletonResolver', () => {
    it('ausente → undefined; presente → buffer alocado pela C2 do primeiro recurso que continua na cena', () => {
        const { world, resources, ctx } = scene();
        const resolver = new SingletonResolver(Cam, 'cam');
        expect(resolver).toMatchObject({ name: 'ResolverCam', typeName: 'ResolverCam' });
        expect(resolver.resolve(ctx)).toBeUndefined();
        const first = new CamBag([{ id: 'cam', role: 'uniform', schema: Cam }]);
        const second = new CamBag([{ id: 'cam', role: 'uniform', schema: Cam }]);
        world.insert(first);
        world.insert(second);
        expect(resolver.resolve(ctx)).toEqual({
            kind: 'buffer',
            buffer: resources.bufferOf(first, 'cam'),
        });
        world.remove(first);
        expect(resolver.resolve(ctx)).toEqual({
            kind: 'buffer',
            buffer: resources.bufferOf(second, 'cam'),
        });
    });

    it('select filtra; visibilidade explícita do descritor acompanha a fonte', () => {
        const { world, ctx } = scene();
        world.insert(new CamBag([{ id: 'cam', role: 'uniform', schema: Cam }], 'a'));
        world.insert(new CamBag([{ id: 'cam', role: 'uniform', schema: Cam, visibility: 2 }], 'b'));
        const resolver = new SingletonResolver(Cam, 'cam', {
            name: 'Selected',
            select: (r) => (r as Bag).tag === 'b',
        });
        expect(resolver.name).toBe('Selected');
        expect(resolver.resolve(ctx)).toMatchObject({ kind: 'buffer', visibility: 2 });
    });
});

describe('PoolResolver', () => {
    it('pool de storage → o buffer inteiro; typeName = wgslName do schema', () => {
        const { world, resources, ctx } = scene();
        world.insert(new Bag([{ id: 'i', role: 'storage-rw', schema: Item, storage: 'pool' }]));
        const resolver = new PoolResolver('ResolverItem', Item);
        expect(resolver.typeName).toBe('Item');
        expect(resolver.resolve(ctx)).toEqual({
            kind: 'buffer',
            buffer: resources.poolBufferSpec('ResolverItem'),
        });
    });

    it('pool uniforme → um registro com offset dinâmico de stride alinhado', () => {
        const { world, ctx } = scene();
        world.insert(new Bag([{ id: 'm', role: 'uniform', schema: Mat, storage: 'pool' }]));
        expect(new PoolResolver('ResolverMat', Mat).resolve(ctx)).toMatchObject({
            kind: 'buffer',
            size: Mat.stride,
            dynamic: { stride: 256 },
        });
    });

    it('a C2 registra um PoolResolver ao criar o pool, sem substituir um existente', () => {
        const { world, consumers } = scene();
        const custom = stub('ResolverMat');
        consumers.register(custom);
        world.insert(new Bag([{ id: 'i', role: 'storage-rw', schema: Item, storage: 'pool' }]));
        world.insert(new Bag([{ id: 'm', role: 'uniform', schema: Mat, storage: 'pool' }]));
        expect(consumers.get('ResolverItem')).toBeInstanceOf(PoolResolver);
        expect(consumers.get('ResolverMat')).toBe(custom);
    });
});

describe('TextureResolver', () => {
    it('view e formato da textura alocada para o descritor do recurso que tem o schema', () => {
        const { world, resources, ctx } = scene();
        const resolver = new TextureResolver('ShadowDepth', 'texture_depth_2d', Cam, 'depth');
        world.insert(
            new Bag([
                {
                    id: 'depth',
                    role: 'texture',
                    textureShape: { format: 'depth32float', width: 8, height: 8 },
                },
            ]),
        );
        expect(resolver.resolve(ctx)).toBeUndefined();
        const owner = new CamBag([
            { id: 'cam', role: 'uniform', schema: Cam },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth32float', width: 8, height: 8 },
            },
        ]);
        world.insert(owner);
        expect(resolver.resolve(ctx)).toEqual({
            kind: 'textureView',
            view: resources.textureViewOf(owner, 'depth'),
            format: 'depth32float',
        });
    });
});
