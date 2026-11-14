/**
 * Os sprites que projetam no mapa de sombra virtual (spec 034): a referência de `ss_pairs_main` e `shadow_sprite_fs` —
 * as páginas do quadrado do disco contêm toda página que o disco toca; a profundidade é a do primeiro ponto da esfera ao
 * longo da luz (o mínimo de z entre os pontos da superfície sobre o mesmo ponto do plano); o centro dá `z_c − r` e a
 * borda do disco, `z_c`.
 */
import { describe, expect, it } from 'vitest';
import { pageRect, spriteFrontDepth, spritePages, type L3 } from '../spritePage';

/** Gerador determinístico (mulberry32). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** O disco toca o retângulo (o ponto do retângulo mais perto do centro está no disco)? */
function diskTouches(c: L3, r: number, rect: readonly number[]): boolean {
    const x = Math.min(Math.max(c[0], rect[0]!), rect[2]!);
    const y = Math.min(Math.max(c[1], rect[1]!), rect[3]!);
    return Math.hypot(x - c[0], y - c[1]) <= r;
}

describe('sprites no mapa de sombra virtual', () => {
    it('as páginas do quadrado do disco contêm toda página que o disco toca', () => {
        // Arrange
        const next = rng(7);
        let checked = 0;
        for (let n = 0; n < 2000; n++) {
            const page = 0.05 + 2 * next();
            const texel = page / 128;
            const c: L3 = [(next() - 0.5) * 20, (next() - 0.5) * 20, next()];
            const r = page * 1.4 * next();
            // Act
            const [x0, y0, x1, y1] = spritePages(c, r, page, texel);
            // Assert: varrendo uma vizinhança larga, toda página tocada está no intervalo.
            for (let gy = y0 - 3; gy <= y1 + 3; gy++)
                for (let gx = x0 - 3; gx <= x1 + 3; gx++) {
                    if (!diskTouches(c, r, pageRect([gx, gy], page, texel))) continue;
                    checked++;
                    expect(gx >= x0 && gx <= x1 && gy >= y0 && gy <= y1).toBe(true);
                }
            // O laço do shader alcança até 4 páginas por eixo: o raio até 1,4 página cabe nele.
            expect(x1 - x0 + 1).toBeLessThanOrEqual(4);
            expect(y1 - y0 + 1).toBeLessThanOrEqual(4);
        }
        expect(checked).toBeGreaterThan(2000);
    });

    it('a profundidade é a do primeiro ponto da esfera ao longo da luz', () => {
        // Arrange
        const next = rng(11);
        const c: L3 = [0.3, -0.2, 1.7];
        const r = 0.04;
        for (let n = 0; n < 500; n++) {
            const q: [number, number] = [
                c[0] + (next() - 0.5) * 2.2 * r,
                c[1] + (next() - 0.5) * 2.2 * r,
            ];
            // Act
            const depth = spriteFrontDepth(c, r, q);
            // Assert: o mínimo de z da superfície sobre q, por amostragem fina do meridiano.
            let best = Infinity;
            for (let k = 0; k <= 20000; k++) {
                const z = c[2] - r + (2 * r * k) / 20000;
                const dz = z - c[2];
                const ring = Math.sqrt(Math.max(r * r - dz * dz, 0));
                const rho = Math.hypot(q[0] - c[0], q[1] - c[1]);
                if (rho <= ring) {
                    best = z;
                    break;
                }
            }
            if (best === Infinity) expect(depth).toBeUndefined();
            else expect(depth!).toBeCloseTo(best, 5);
        }
    });

    it('o centro dá z_c − r e a borda do disco, z_c', () => {
        const c: L3 = [1, 2, 3];
        expect(spriteFrontDepth(c, 0.5, [1, 2])).toBeCloseTo(2.5, 12);
        expect(spriteFrontDepth(c, 0.5, [1.5, 2])).toBeCloseTo(3, 12);
        expect(spriteFrontDepth(c, 0.5, [1.5000001, 2])).toBeUndefined();
    });
});
