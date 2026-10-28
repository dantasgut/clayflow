import { describe, expect, it } from 'vitest';
import { GltfLoader } from '../GltfLoader';

/** GLB mínimo: uma mesh com POSITION (3 vértices) e índices no componentType pedido. */
function glbWithIndices(componentType: number, indices: readonly number[]): ArrayBuffer {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bytesPer = componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4;
    const indexBytes = indices.length * bytesPer;
    const binLength = Math.ceil((positions.byteLength + indexBytes) / 4) * 4;
    const bin = new Uint8Array(binLength);
    bin.set(new Uint8Array(positions.buffer), 0);
    const dv = new DataView(bin.buffer);
    indices.forEach((v, i) => {
        const at = positions.byteLength + i * bytesPer;
        if (bytesPer === 1) dv.setUint8(at, v);
        else if (bytesPer === 2) dv.setUint16(at, v, true);
        else dv.setUint32(at, v, true);
    });
    const json = {
        asset: { version: '2.0' },
        buffers: [{ byteLength: binLength }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
            { buffer: 0, byteOffset: positions.byteLength, byteLength: indexBytes },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
            { bufferView: 1, componentType, count: indices.length, type: 'SCALAR' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
    };
    let jsonText = JSON.stringify(json);
    while (jsonText.length % 4 !== 0) jsonText += ' ';
    const jsonBytes = new TextEncoder().encode(jsonText);
    const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
    const out = new Uint8Array(total);
    const o = new DataView(out.buffer);
    o.setUint32(0, 0x46546c67, true);
    o.setUint32(4, 2, true);
    o.setUint32(8, total, true);
    o.setUint32(12, jsonBytes.length, true);
    o.setUint32(16, 0x4e4f534a, true);
    out.set(jsonBytes, 20);
    const binAt = 20 + jsonBytes.length;
    o.setUint32(binAt, bin.length, true);
    o.setUint32(binAt + 4, 0x004e4942, true);
    out.set(bin, binAt + 8);
    return out.buffer;
}

describe('GltfLoader — índices', () => {
    it('UNSIGNED_BYTE é ampliado para Uint16Array com os valores certos', async () => {
        const doc = await new GltfLoader().parse(
            glbWithIndices(5121, [0, 2, 1, 2, 0, 1]),
            'mem.glb',
        );
        const idx = doc.meshes[0]!.primitives[0]!.indices;
        expect(idx).toBeInstanceOf(Uint16Array);
        expect(Array.from(idx!)).toEqual([0, 2, 1, 2, 0, 1]);
    });

    it('UNSIGNED_SHORT → Uint16Array; UNSIGNED_INT → Uint32Array', async () => {
        const short = await new GltfLoader().parse(glbWithIndices(5123, [0, 1, 2]), 'a.glb');
        expect(short.meshes[0]!.primitives[0]!.indices).toEqual(new Uint16Array([0, 1, 2]));
        const int = await new GltfLoader().parse(glbWithIndices(5125, [2, 1, 0]), 'b.glb');
        expect(int.meshes[0]!.primitives[0]!.indices).toEqual(new Uint32Array([2, 1, 0]));
    });
});
