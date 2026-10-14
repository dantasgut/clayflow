/**
 * Superfície de corpo mole (spec 008, US3): `SoftBody({ surface })` cria uma `SurfaceGeometry` como parte (vértices
 * enviados só na inserção, triângulos `uint32`, adjacência CSR); o `SoftSurfaceFlow` é o escritor dos vértices, despacha
 * dois kernels por corpo por quadro e a CPU não escreve vértices depois da inserção; o forward desenha a malha.
 */
import { describe, expect, it } from 'vitest';
import { SoftBody } from '../bodies/SoftBody';
import { SurfaceGeometry } from '../../geometry/SurfaceGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Camera } from '../../scene/Camera';
import { Transform } from '../../scene/Transform';
import {
    discOf,
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

/** Quadrado de 2 × 2 partículas com 2 triângulos. */
const square = () =>
    new SoftBody({
        algorithm: 'XPBD',
        position: [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1],
        mass: 1,
        surface: { triangles: [0, 2, 1, 1, 2, 3], uvs: [0, 0, 1, 0, 0, 1, 1, 1] },
    });

describe('SurfaceGeometry (spec 008)', () => {
    it('vértices iniciais com uv, triângulos uint32 e adjacência CSR', () => {
        const body = square();
        const surface = body.surface!;
        expect(body.attached).toContain(surface);
        expect(surface.vertexCount).toBe(4);
        expect(surface.triangleCount).toBe(2);
        expect(surface.data.indices).toBeInstanceOf(Uint32Array);
        // Inícios por vértice (4 + 1) e os triângulos de cada vértice.
        expect([...surface.data.adjacency]).toEqual([0, 1, 3, 5, 6, 0, 0, 1, 0, 1, 1]);
        expect([...surface.data.vertices.subarray(8, 16)]).toEqual([1, 0, 0, 0, 1, 0, 1, 0]);
        const [vertices, indices] = surface.getDescriptors();
        expect(vertices!.upload).toBe('initial');
        expect(indices!.role).toBe('index');
        expect(surface.contentKey).toBeUndefined();
    });

    it('índice fora dos vértices e uvs com tamanho errado são erro', () => {
        expect(() => new SurfaceGeometry([0, 0, 0], [0, 0, 1])).toThrow(
            /triangles\[2\] = 1 fora dos 1 vértices/,
        );
        expect(() => new SurfaceGeometry([0, 0, 0], [0, 0, 0], [0])).toThrow(/uvs tem 1 valores/);
    });
});

describe('SoftSurfaceFlow (spec 008)', () => {
    async function scene() {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene', softSurface: true });
        s.scene.world.insert(new Camera().add(new Transform()));
        return s;
    }

    it('escritor dos vértices; dois kernels por corpo por quadro; a CPU não escreve vértices por quadro', async () => {
        const s = await scene();
        const a = square().add(new StandardMaterial()).add(new Transform());
        const b = square().add(new StandardMaterial()).add(new Transform());
        s.scene.world.insert(a);
        s.scene.world.insert(b);
        s.step();
        expect(s.scene.resourceSystem.hasGpuWriter(a.surface!, 'vertices')).toBe(true);
        s.resetCounts();
        s.step();
        expect(s.computes().filter((c) => c.startsWith('SoftSurfaceFlow'))).toEqual([
            'SoftSurfaceFlow.face_normals',
            'SoftSurfaceFlow.vertex_write',
            'SoftSurfaceFlow.face_normals',
            'SoftSurfaceFlow.vertex_write',
        ]);
        const vertexBuffers = [a, b].map((body) =>
            s.scene.resourceSystem.bufferOf(body.surface!, 'vertices'),
        );
        expect(s.writes().filter((w) => vertexBuffers.includes(w as never))).toHaveLength(0);
        expect(s.writes().filter((w) => discOf(w).startsWith('soft_surface_params'))).toHaveLength(
            0,
        );
        // O forward desenha a malha (mesma geometria própria de cada corpo: um grupo por corpo).
        expect(s.draws('ForwardFlow').map((d) => d.indexCount)).toEqual([6, 6]);
    });

    it('corpo removido: kernels e normais de face liberados', async () => {
        const s = await scene();
        const a = square().add(new StandardMaterial()).add(new Transform());
        s.scene.world.insert(a);
        s.step();
        s.resetCounts();
        s.scene.world.remove(a);
        s.step();
        expect(s.destroys().some((d) => discOf(d).startsWith('soft_surface_faces'))).toBe(true);
        expect(s.computes().filter((c) => c.startsWith('SoftSurfaceFlow'))).toHaveLength(0);
    });
});
