import { describe, expect, it } from 'vitest';
import { SphereGeometry } from '../SphereGeometry';
import { ParametricGeometry } from '../ParametricGeometry';
import { ParametricSurfaceGeometry } from '../ParametricSurfaceGeometry';
import { BoxGeometry } from '../BoxGeometry';
import { PlaneGeometry } from '../PlaneGeometry';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';

describe('formato de índice derivado do número de vértices (R12)', () => {
    it('SphereGeometry pequena → Uint16Array e indexFormat uint16', () => {
        const g = new SphereGeometry({ radius: 1 });
        expect(g.data.indices).toBeInstanceOf(Uint16Array);
        expect(g.indexFormat).toBe('uint16');
    });

    it('SphereGeometry acima de 65 535 vértices → Uint32Array com índices corretos', () => {
        const g = new SphereGeometry({ radius: 1, latSegments: 300, lonSegments: 300 });
        expect(g.vertexCount).toBe(301 * 301);
        const idx = g.data.indices as Uint32Array;
        expect(idx).toBeInstanceOf(Uint32Array);
        expect(g.indexFormat).toBe('uint32');
        expect(Math.max(...idx.subarray(idx.length - 6))).toBe(g.vertexCount - 1);
        expect(idx.every((i) => i < g.vertexCount)).toBe(true);
    });

    it('ParametricGeometry com 65 536 vértices (limite) → uint32; com 65 535 ou menos → uint16', () => {
        const small = new ParametricGeometry({ uSteps: 254, vSteps: 254 }); // 255² = 65 025
        expect(small.indexFormat).toBe('uint16');
        const big = new ParametricGeometry({ uSteps: 255, vSteps: 256 }); // 256 × 257 = 65 792
        expect(big.vertexCount).toBeGreaterThan(65_535);
        expect(big.data.indices).toBeInstanceOf(Uint32Array);
        expect(big.indexFormat).toBe('uint32');
        const idx = big.data.indices as Uint32Array;
        expect(Math.max(...idx.subarray(idx.length - 6))).toBe(big.vertexCount - 1);
    });

    it('ParametricSurfaceGeometry herda a regra', () => {
        const g = new ParametricSurfaceGeometry((u, v) => [u, v, 0], { uSteps: 300, vSteps: 300 });
        expect(g.indexFormat).toBe('uint32');
    });

    it('Box e Plane continuam uint16', () => {
        expect(new BoxGeometry().indexFormat).toBe('uint16');
        expect(new PlaneGeometry().indexFormat).toBe('uint16');
    });

    it('schemas de vértice das geometrias: layout compacto de 32 bytes = dado intercalado', () => {
        for (const g of [
            new BoxGeometry(),
            new SphereGeometry(),
            new PlaneGeometry(),
            new ParametricGeometry(),
        ]) {
            const schema = g.getDescriptors()[0]!.schema as StructSchema;
            expect(schema.vertexLayout.stride).toBe(32);
            expect(g.data.vertices!.byteLength).toBe(g.vertexCount * 32);
        }
    });
});
