import { describe, expect, it } from 'vitest';
import { ForwardFlow } from '../ForwardFlow';
import { ShadowFlow } from '../ShadowFlow';
import { Geometry } from '../../../elements/geometry/Geometry';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { World } from '../../../scene/world/World';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { IndexBufferSpec } from '../../../core/contracts/index';
import { discOf, renderHarness } from './helpers/renderHarness';

/** Triângulo único: 3 índices uint16 = 6 bytes, exige padding a 8. */
class Triangle extends Geometry {
    constructor() {
        super();
        this.data = {
            vertices: new Float32Array(3 * 8),
            indices: new Uint16Array([0, 1, 2]),
        };
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            { id: 'vertices', role: 'vertex', schema: BoxGeometry.vertexStruct, count: 3 },
            { id: 'indices', role: 'index', count: 3 },
        ];
    }
    get vertexCount(): number {
        return 3;
    }
    get indexCount(): number {
        return 3;
    }
}

function forward(geometry: Geometry) {
    const h = renderHarness();
    const world = new World(new DefaultEventBus());
    world.insert(new Camera());
    const id = world.insert(
        geometry.add(new StandardMaterial({ albedo: [1, 1, 1, 1] })).add(new Transform()),
    );
    h.slots.set(id, 0);
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const flow = new ForwardFlow(h.core, world, h.pools, canvas);
    flow.dispatch(h.frame);
    return h.creates.find((c) => discOf(c).startsWith('forward_ibo:')) as IndexBufferSpec;
}

function shadow(geometry: Geometry) {
    const h = renderHarness();
    const world = new World(new DefaultEventBus());
    world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
    const id = world.insert(geometry.add(new Transform()));
    h.slots.set(id, 0);
    const flow = new ShadowFlow(h.core, world, h.pools);
    flow.dispatch(h.frame);
    return h.creates.find((c) => discOf(c).startsWith('shadow_ibo:')) as IndexBufferSpec;
}

describe.each([
    ['ForwardFlow', forward],
    ['ShadowFlow', shadow],
])('%s — IBO com formato e padding do array', (_name, build) => {
    it('malha acima de 65 535 vértices → uint32', () => {
        const g = new SphereGeometry({ latSegments: 300, lonSegments: 300 });
        const ibo = build(g);
        expect(ibo.format).toBe('uint32');
        expect(ibo.byteSize).toBe(g.indexCount * 4);
        expect(ibo.count).toBe(g.indexCount);
    });

    it('malha pequena → uint16', () => {
        const ibo = build(new BoxGeometry());
        expect(ibo.format).toBe('uint16');
        expect(ibo.byteSize).toBe(72);
    });

    it('3 índices uint16 (6 bytes) → buffer de 8 bytes', () => {
        const ibo = build(new Triangle());
        expect(ibo.format).toBe('uint16');
        expect(ibo.byteSize).toBe(8);
    });
});
