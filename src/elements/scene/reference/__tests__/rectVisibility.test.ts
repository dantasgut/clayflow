import { describe, expect, it } from 'vitest';
import { rectVisibleFraction, segmentBlocked, type RectSource } from '../rectVisibility';

/** Um painel de 2 × 1 m a 3 m de altura, virado para baixo. */
const panel: RectSource = { center: [0, 3, 0], normal: [0, -1, 0], axis: [1, 0, 0], size: [2, 1] };

describe('rectVisibleFraction', () => {
    it('sem oclusor, a fonte inteira', () => {
        expect(rectVisibleFraction([0.3, 0, -0.2], panel, [])).toBe(1);
    });

    it('atrás do lado que emite, nada', () => {
        expect(rectVisibleFraction([0, 4, 0], panel, [])).toBe(0);
    });

    it('uma esfera grande no caminho tapa tudo', () => {
        const sphere = { kind: 'sphere', center: [0, 1.5, 0], radius: 1.2 } as const;
        expect(rectVisibleFraction([0, 0, 0], panel, [sphere])).toBe(0);
    });

    it('o meio-plano com a borda sob o meio da fonte tapa metade, visto de baixo do centro', () => {
        // O anteparo horizontal a meia altura, cobrindo x ≤ 0: do ponto sob o centro, tapa a metade x < 0 do painel.
        const screen = {
            kind: 'halfPlane',
            point: [0, 1.5, 0],
            normal: [0, 1, 0],
            inside: [1, 0, 0],
        } as const;
        expect(rectVisibleFraction([0, 0, 0], panel, [screen], 256)).toBeCloseTo(0.5, 6);
    });

    it('o meio-plano visto de lado: a fração é a parte do painel além da projeção da borda', () => {
        // Do ponto em x = p, a borda (x = 0, y = h) projeta-se no painel (y = H) em x = p · (1 − H / h): com p = 0,25,
        // h = 1,5 e H = 3, em x = −0,25 — visível a parte x > −0,25: (1 + 0,25) / 2 = 0,625 da largura.
        const screen = {
            kind: 'halfPlane',
            point: [0, 1.5, 0],
            normal: [0, 1, 0],
            inside: [1, 0, 0],
        } as const;
        expect(rectVisibleFraction([0.25, 0, 0], panel, [screen], 512)).toBeCloseTo(0.625, 3);
    });

    it('a esfera pequena sob o centro tapa o disco da sua sombra projetada no painel', () => {
        // Do ponto sob o centro, a esfera de raio r a meia altura (distância d = 1,5) tapa o cone de meio ângulo
        // asin(r / d); no painel (a 3 m), o disco de raio 3 · tan(asin(r / d)).
        const r = 0.1;
        const sphere = { kind: 'sphere', center: [0, 1.5, 0], radius: r } as const;
        const shadow = 3 * Math.tan(Math.asin(r / 1.5));
        const expected = 1 - (Math.PI * shadow * shadow) / (2 * 1);
        expect(rectVisibleFraction([0, 0, 0], panel, [sphere], 1024)).toBeCloseTo(expected, 3);
    });

    it('a fonte pequena vira pontual: tudo ou nada', () => {
        const small: RectSource = { ...panel, size: [1e-4, 1e-4] };
        const screen = {
            kind: 'halfPlane',
            point: [0, 1.5, 0],
            normal: [0, 1, 0],
            inside: [1, 0, 0],
        } as const;
        expect(rectVisibleFraction([0.2, 0, 0], small, [screen], 16)).toBe(1);
        expect(rectVisibleFraction([-0.2, 0, 0], small, [screen], 16)).toBe(0);
    });
});

describe('segmentBlocked', () => {
    it('a esfera fora do segmento (depois do fim) não tapa', () => {
        const sphere = { kind: 'sphere', center: [0, 5, 0], radius: 0.5 } as const;
        expect(segmentBlocked([0, 0, 0], [0, 3, 0], sphere)).toBe(false);
    });
});
