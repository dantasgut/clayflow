import { BoxGeometry, DataTexture, Group, InstancedMesh, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { estimateThreeMemory } from '../../engines/threeMemory';

function geometryBytes(g: BoxGeometry): number {
    let n = 0;
    for (const a of Object.values(g.attributes))
        n += (a as { array: { byteLength: number } }).array.byteLength;
    return n + (g.index?.array.byteLength ?? 0);
}

describe('estimateThreeMemory', () => {
    it('geometria compartilhada conta uma vez', () => {
        const g = new BoxGeometry();
        const m = new MeshBasicMaterial();
        const group = new Group();
        group.add(new Mesh(g, m), new Mesh(g, m), new Mesh(g, m));
        expect(estimateThreeMemory(group)).toBe(geometryBytes(g));
    });

    it('InstancedMesh conta a instanceMatrix', () => {
        const g = new BoxGeometry();
        const mesh = new InstancedMesh(g, new MeshBasicMaterial(), 100);
        expect(estimateThreeMemory(mesh)).toBe(geometryBytes(g) + 100 * 16 * 4);
    });

    it('texturas: largura × altura × 4 × mips, uma vez por textura', () => {
        const tex = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
        tex.generateMipmaps = true;
        const m = new MeshBasicMaterial({ map: tex });
        const g = new BoxGeometry();
        const group = new Group();
        group.add(new Mesh(g, m), new Mesh(g, new MeshBasicMaterial({ map: tex })));
        // 4×4 + 2×2 + 1×1 = 21 texels × 4 bytes
        expect(estimateThreeMemory(group)).toBe(geometryBytes(g) + 21 * 4);
    });
});
