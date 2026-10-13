/**
 * Dedup de geometria por conteúdo (spec 007, R1): Resources com a mesma `contentKey` usam o mesmo buffer de vértice e
 * de índice, criado e escrito uma vez; o último usuário o destrói; atribuir conteúdo novo troca de buffer (cópia na
 * escrita).
 */
import { describe, expect, it } from 'vitest';
import type { AnyBufferSpec } from '../../core/contracts/index';
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

const Vertex = new StructSchema('DedupVertex', { position: FieldType.vec3f, pad: FieldType.f32 });

class Shape extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(
        readonly key: string | undefined,
        vertices = new Float32Array(12),
        indices = new Uint16Array([0, 1, 2]),
    ) {
        super();
        this.data = { vertices, indices };
    }
    get contentKey(): string | undefined {
        return this.key ?? (this.data.k as string | undefined);
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: Vertex },
            { id: 'indices', role: 'index' },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    const resources = new ResourceSystem(fake.core, events, world);
    const frame = (): void => {
        events.emit('frameRecording', { elapsed: 0 });
    };
    const geometryCreates = () =>
        (fake.core.create as unknown as { mock: { calls: [AnyBufferSpec][] } }).mock.calls
            .map(([spec]) => spec)
            .filter((spec) => spec.subkind === 'vertex' || spec.subkind === 'index');
    return { world, resources, frame, geometryCreates, ...fake };
}

describe('dedup de geometria por conteúdo (spec 007)', () => {
    it('mesma chave: um buffer de vértice e um de índice, escritos uma vez', () => {
        const s = setup();
        const shapes = Array.from({ length: 100 }, () => new Shape('box'));
        for (const shape of shapes) s.world.insert(shape);
        expect(s.geometryCreates()).toHaveLength(2);
        expect(s.writes).toHaveLength(2);
        const vbo = s.resources.bufferOf(shapes[0]!, 'vertices');
        expect(shapes.every((sh) => s.resources.bufferOf(sh, 'vertices') === vbo)).toBe(true);
    });

    it('chaves diferentes: buffers próprios; sem chave: buffer por Resource', () => {
        const s = setup();
        s.world.insert(new Shape('a'));
        s.world.insert(new Shape('b'));
        s.world.insert(new Shape(undefined));
        s.world.insert(new Shape(undefined));
        expect(s.geometryCreates()).toHaveLength(8);
    });

    it('o buffer fica enquanto houver usuário e é destruído com o último', () => {
        const s = setup();
        const first = new Shape('box');
        const second = new Shape('box');
        s.world.insert(first);
        s.world.insert(second);
        const vbo = s.resources.bufferOf(first, 'vertices');
        s.world.remove(first);
        expect(s.core.destroy).not.toHaveBeenCalledWith(vbo);
        s.world.remove(second);
        expect(s.core.destroy).toHaveBeenCalledWith(vbo);
        // Reinserção recria e reescreve.
        s.writes.length = 0;
        s.world.insert(new Shape('box'));
        expect(s.writes).toHaveLength(2);
    });

    it('conteúdo atribuído com chave nova troca de buffer (cópia na escrita) sem afetar os outros', () => {
        const s = setup();
        const shared = new Shape(undefined);
        shared.data.k = 'box';
        const other = new Shape('box');
        s.world.insert(shared);
        s.world.insert(other);
        const vbo = s.resources.bufferOf(other, 'vertices');
        s.writes.length = 0;
        shared.data.vertices = new Float32Array(24);
        shared.data.k = 'longer';
        s.frame();
        expect(s.resources.bufferOf(shared, 'vertices')).not.toBe(vbo);
        expect(s.resources.bufferOf(other, 'vertices')).toBe(vbo);
        expect(s.core.destroy).not.toHaveBeenCalledWith(vbo);
        expect(s.writes.length).toBeGreaterThan(0);
        // Mesma chave depois de uma mutação: nada a reenviar.
        s.writes.length = 0;
        other.data.k = 'ignored';
        s.frame();
        expect(s.writes).toHaveLength(0);
    });
});
