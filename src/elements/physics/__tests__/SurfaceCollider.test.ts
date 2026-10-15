/**
 * Spec 010 (R1): colisor de superfície — registro e campo em pool (cópias × (cabeçalho + nós)), modos, resolução e
 * validação.
 */
import { describe, expect, it } from 'vitest';
import {
    SURFACE_COLLIDER_HEADER,
    SURFACE_COLLIDER_STEPS,
    SurfaceCollider,
} from '../colliders/SurfaceCollider';

describe('SurfaceCollider (spec 010)', () => {
    it('altura: grade nx × nz (padrão 128²), um nó em y, amostragem igual à grade', () => {
        const c = new SurfaceCollider();
        expect(c.mode).toBe('height');
        expect([c.data.nx, c.data.ny, c.data.nz]).toEqual([128, 1, 128]);
        expect(c.sampling).toEqual([128, 128]);
        expect(c.data.copies).toBe(SURFACE_COLLIDER_STEPS);
        expect(c.data.copy_stride).toBe(SURFACE_COLLIDER_HEADER + 128 * 128);
    });

    it('distância: n³ (padrão 64³), amostragem 2n, banda e folga', () => {
        const c = new SurfaceCollider({ mode: 'distance', resolution: 32, margin: 0.02, band: 3 });
        expect(c.mode).toBe('distance');
        expect([c.data.nx, c.data.ny, c.data.nz]).toEqual([32, 32, 32]);
        expect(c.sampling).toEqual([64, 64]);
        expect(c.data.band).toBe(3);
        expect(c.data.margin).toBeCloseTo(0.02);
        expect(c.cellCount).toBe(32 ** 3);
    });

    it('descritores: registro com o início do campo resolvido pela C2; campo só da GPU com as cópias', () => {
        const c = new SurfaceCollider({ resolution: [8, 4], steps: 2 });
        const [record, field] = c.getDescriptors();
        expect(record).toMatchObject({
            id: 'collider',
            storage: 'pool',
            schema: SurfaceCollider.schema,
            slotRefs: { first: 'self:field' },
        });
        expect(field).toMatchObject({
            id: 'field',
            storage: 'pool',
            upload: 'never',
            schema: SurfaceCollider.cellSchema,
            count: 2 * (SURFACE_COLLIDER_HEADER + 8 * 4),
        });
    });

    it('validação: modo, resolução, folga, banda, cópias e amostragem', () => {
        expect(() => new SurfaceCollider({ mode: 'x' as 'height' })).toThrow(/modo/);
        expect(() => new SurfaceCollider({ resolution: 1 })).toThrow(/resolução/);
        expect(() => new SurfaceCollider({ mode: 'distance', resolution: 512 })).toThrow(
            /resolução/,
        );
        expect(() => new SurfaceCollider({ margin: -1 })).toThrow(/folga/);
        expect(() => new SurfaceCollider({ band: 20 })).toThrow(/banda/);
        expect(() => new SurfaceCollider({ steps: 0 })).toThrow(/cópias/);
        expect(() => new SurfaceCollider({ sampling: [1, 4] })).toThrow(/amostragem/);
    });
});
