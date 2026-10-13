/**
 * Geometria escrita pela GPU (spec 008, R6): índice `'never'` exige `indexFormat`; `owns` sobre descritor individual
 * registra o escritor (`hasGpuWriter`); dois escritores do mesmo descritor é erro.
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
import { memoryCore } from './helpers/memoryCore';

const Vtx = new StructSchema('GpuGeoVertex', {
    position: FieldType.vec3f,
    normal: FieldType.vec3f,
    uv: FieldType.vec2f,
});

class GpuMesh extends Entity implements Resource {
    state = ResourceState.Uninitialized;
    constructor(readonly format: GPUIndexFormat | undefined) {
        super();
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: Vtx, count: 100, upload: 'never' },
            {
                id: 'indices',
                role: 'index',
                count: 300,
                upload: 'never',
                ...(this.format !== undefined ? { indexFormat: this.format } : {}),
            },
        ];
    }
    getPipelineDescriptors() {
        return [];
    }
}

function setup() {
    const events = new DefaultEventBus();
    const world = new World(events);
    const { core } = memoryCore();
    const resources = new ResourceSystem(core, events, world);
    return { world, resources };
}

describe('geometria escrita pela GPU (spec 008)', () => {
    it("índice 'never' sem indexFormat é erro; com uint32, 4 bytes por índice", () => {
        const s = setup();
        expect(() => s.world.insert(new GpuMesh(undefined))).toThrow(/'indices'.*indexFormat/);
        const mesh = new GpuMesh('uint32');
        s.world.insert(mesh);
        expect(s.resources.bufferOf(mesh, 'indices')?.byteSize).toBe(1200);
        expect(s.resources.bufferOf(mesh, 'vertices')?.byteSize).toBe(
            100 * Vtx.vertexLayout.stride,
        );
    });

    it('owns sobre descritor individual registra o escritor; outro escritor é erro', () => {
        const s = setup();
        const mesh = new GpuMesh('uint32');
        s.world.insert(mesh);
        const writer = {};
        expect(s.resources.hasGpuWriter(mesh, 'vertices')).toBe(false);
        s.resources.acquireOwnership(writer, mesh, 'vertices');
        expect(s.resources.hasGpuWriter(mesh, 'vertices')).toBe(true);
        expect(() => {
            s.resources.acquireOwnership({}, mesh, 'vertices');
        }).toThrow(/já tem escritor/);
        s.resources.releaseOwnership(writer, mesh, 'vertices');
        expect(s.resources.hasGpuWriter(mesh, 'vertices')).toBe(false);
    });
});
