import { describe, expect, it } from 'vitest';
import { Geometry } from '../../../elements/geometry/Geometry';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { IndexBufferSpec } from '../../../core/contracts/index';
import { registerStages, renderScene } from './helpers/renderHarness';

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

/** IBO usado no desenho da geometria pelo estágio (o alocado pela C2 a partir do descritor `indices`). */
async function drawnIndexBuffer(
    stage: 'ForwardFlow' | 'ShadowFlow',
    geometry: Geometry,
): Promise<IndexBufferSpec> {
    const s = await renderScene();
    if (stage === 'ForwardFlow') {
        registerStages(s.scene, { forward: 'canvas' });
        s.scene.world.insert(new Camera());
        s.scene.world.insert(geometry.add(new StandardMaterial()).add(new Transform()));
    } else {
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
        s.scene.world.insert(geometry.add(new Transform()));
    }
    s.step();
    const [draw] = s.draws(stage);
    expect(draw!.index).toBe(s.scene.resourceSystem.bufferOf(geometry, 'indices'));
    return draw!.index as IndexBufferSpec;
}

describe.each(['ForwardFlow', 'ShadowFlow'] as const)(
    '%s — IBO com formato e padding do array',
    (stage) => {
        it('malha acima de 65 535 vértices → uint32', async () => {
            const g = new SphereGeometry({ latSegments: 300, lonSegments: 300 });
            const ibo = await drawnIndexBuffer(stage, g);
            expect(ibo.format).toBe('uint32');
            expect(ibo.byteSize).toBe(g.indexCount * 4);
            expect(ibo.count).toBe(g.indexCount);
        });

        it('malha pequena → uint16', async () => {
            const ibo = await drawnIndexBuffer(stage, new BoxGeometry());
            expect(ibo.format).toBe('uint16');
            expect(ibo.byteSize).toBe(72);
        });

        it('3 índices uint16 (6 bytes) → buffer de 8 bytes', async () => {
            const ibo = await drawnIndexBuffer(stage, new Triangle());
            expect(ibo.format).toBe('uint16');
            expect(ibo.byteSize).toBe(8);
        });
    },
);
