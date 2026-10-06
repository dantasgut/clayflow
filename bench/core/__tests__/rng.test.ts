import { describe, expect, it } from 'vitest';
import { gridScatter, heightJitter, motionAt, mulberry32 } from '../rng';

describe('mulberry32', () => {
    it('mesma semente ⇒ mesma sequência', () => {
        const a = mulberry32(1337);
        const b = mulberry32(1337);
        const sa = Array.from({ length: 50 }, a);
        const sb = Array.from({ length: 50 }, b);
        expect(sa).toEqual(sb);
    });

    it('sementes diferentes divergem', () => {
        const a = Array.from({ length: 10 }, mulberry32(1));
        const b = Array.from({ length: 10 }, mulberry32(2));
        expect(a).not.toEqual(b);
    });

    it('valores em [0, 1)', () => {
        const r = mulberry32(42);
        for (let i = 0; i < 10_000; i++) {
            const v = r();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('layout', () => {
    it('gridScatter é determinístico e respeita contagem e extensão', () => {
        const a = gridScatter(mulberry32(7), 100, 50);
        const b = gridScatter(mulberry32(7), 100, 50);
        expect(a).toEqual(b);
        expect(a).toHaveLength(100);
        for (const p of a) {
            expect(Math.abs(p.position[0])).toBeLessThanOrEqual(25);
            expect(Math.abs(p.position[2])).toBeLessThanOrEqual(25);
            expect(Math.hypot(...p.rotation)).toBeCloseTo(1, 9);
        }
    });

    it('heightJitter fica em [0, amplitude)', () => {
        const r = mulberry32(3);
        for (let i = 0; i < 100; i++) {
            const h = heightJitter(r, 2);
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(2);
        }
    });
});

describe('motionAt', () => {
    const base = gridScatter(mulberry32(9), 4, 10)[2]!;

    it('t = 0 devolve a pose base', () => {
        const m = motionAt(base, 2, 0);
        expect(m.position).toEqual(base.position);
        expect(m.rotation).toEqual(base.rotation);
    });

    it('é determinístico e produz quaternion unitário', () => {
        const a = motionAt(base, 2, 1.25);
        const b = motionAt(base, 2, 1.25);
        expect(a).toEqual(b);
        expect(Math.hypot(...a.rotation)).toBeCloseTo(1, 9);
        expect(a.position).not.toEqual(base.position);
    });

    it('índices diferentes têm fases diferentes', () => {
        expect(motionAt(base, 1, 0.5).position).not.toEqual(motionAt(base, 2, 0.5).position);
    });
});
