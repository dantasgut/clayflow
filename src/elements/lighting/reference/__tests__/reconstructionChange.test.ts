/**
 * O gradiente temporal da reconstrução da refração em meia resolução (spec 034, T066d): a referência de
 * `refraction_block_changed` — a etiqueta do último traçado guarda o deslocamento da amostra a 1/31 de pixel; com a cena
 * parada vista por uma lente (o ponto mostrado anda M por pixel), o deslocamento da amostra pelo antisserrilhado temporal
 * não conta como mudança; a imagem que anda acima da folga conta; uma amostra só que discorda não basta; a mudança pede a
 * discordância também num traçado anterior do bloco; sem traçado do mesmo objeto não se sabe.
 */
import { describe, expect, it } from 'vitest';
import {
    blockChange,
    blockChanged,
    KEEP_DRIFT,
    traceJitter,
    traceRecord,
    traceTag,
    TRACE_STEPS,
    type P2,
    type P3,
    type Trace,
} from '../reconstructionChange';

/** O deslocamento da amostra no quadro `f`: Halton (2, 3) em [−½, ½]², como o do antisserrilhado temporal. */
function halton(f: number): P2 {
    const radical = (i: number, b: number): number => {
        let r = 0;
        let s = 1 / b;
        for (let n = i; n > 0; n = Math.floor(n / b), s /= b) r += (n % b) * s;
        return r;
    };
    return [radical(f + 1, 2) - 0.5, radical(f + 1, 3) - 0.5];
}

/** O ponto mostrado pela amostra na posição `s` da tela: a lente que amplia M vezes, deslocada de `shift`. */
type Shown = (s: P2) => P3;
const lens =
    (m: number, shift = 0): Shown =>
    (s) => [m * s[0] + shift, m * s[1] + 0.02 * m * Math.sin(s[0] / 3), 1];

/** Os últimos traçados dos pixels 3 × 3 em volta de `rep`, cada um num quadro anterior, vistos por `shown`. */
function traces(rep: P2, shown: Shown, first: number): Trace[] {
    const out: Trace[] = [];
    for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
            const pixel: P2 = [rep[0] + dx, rep[1] + dy];
            const j = halton(first + out.length);
            // O ponto pelo deslocamento exato; a etiqueta o guarda a 1/31 de pixel (como no traçado).
            out.push({
                pixel,
                tag: traceTag(7, j),
                point: shown([pixel[0] + 0.5 + j[0], pixel[1] + 0.5 + j[1]]),
            });
        }
    return out;
}

describe('o gradiente temporal da reconstrução (referência de refraction_block_changed)', () => {
    it('a etiqueta guarda o deslocamento a meio passo de 1/31 de pixel, o registro em 20 bits e a marca de traçado', () => {
        // Arrange
        const jitters = Array.from({ length: 64 }, (_, f) => halton(f));

        // Act
        const back = jitters.map((j) => traceJitter(traceTag(5, j)));

        // Assert
        jitters.forEach((j, k) => {
            expect(Math.abs((back[k]?.[0] ?? 9) - j[0])).toBeLessThanOrEqual(
                0.5 / TRACE_STEPS + 1e-12,
            );
            expect(Math.abs((back[k]?.[1] ?? 9) - j[1])).toBeLessThanOrEqual(
                0.5 / TRACE_STEPS + 1e-12,
            );
        });
        // O registro sem objeto (`NONE`, 0xFFFFFFFF) e os acima de 20 bits ficam em 0xFFFFF.
        expect(traceRecord(traceTag(0xffffffff, [0, 0]))).toBe(0xfffff);
        expect(traceTag(5, [0, 0]) >>> 31).toBe(1);
    });

    it('com a cena parada vista por uma lente que amplia 6 vezes, os 32 deslocamentos seguintes não contam como mudança', () => {
        // Arrange
        const rep: P2 = [40, 30];
        const m = 6;
        const shown = lens(m);

        // Act
        const changed = Array.from({ length: 32 }, (_, f) => {
            const j = halton(9 + f);
            return blockChanged(
                rep,
                j,
                shown([rep[0] + 0.5 + j[0], rep[1] + 0.5 + j[1]]),
                7,
                m,
                traces(rep, shown, f),
            );
        });

        // Assert
        expect(changed.every((c) => !c)).toBe(true);
    });

    it('a imagem que a lente leva andou 4 larguras de pixel: muda em todos os deslocamentos', () => {
        // Arrange
        const rep: P2 = [40, 30];
        const m = 6;
        const before = lens(m);
        const now = lens(m, 4 * m);

        // Act
        const changed = Array.from({ length: 32 }, (_, f) => {
            const j = halton(9 + f);
            return blockChanged(
                rep,
                j,
                now([rep[0] + 0.5 + j[0], rep[1] + 0.5 + j[1]]),
                7,
                m,
                traces(rep, before, f),
            );
        });

        // Assert
        expect(changed.every((c) => c)).toBe(true);
    });

    it('a amostra mais perto dá a folga: na mesma posição, meia largura de pixel já é mudança', () => {
        // Arrange
        const rep: P2 = [10, 10];
        const m = 2;
        const j: P2 = [0.1, -0.2];
        const tag = traceTag(3, j);
        const q = traceJitter(tag);
        const at = (s: number): P3 => [m * (rep[0] + 0.5 + q[0]) + s, m * (rep[1] + 0.5 + q[1]), 0];
        const same: Trace = { pixel: rep, tag, point: at(0) };

        // Act
        const still = blockChanged(rep, q, at(0), 3, m, [same]);
        const moved = blockChanged(rep, q, at(0.5 * m), 3, m, [same]);

        // Assert
        expect((KEEP_DRIFT * m) / TRACE_STEPS).toBeLessThan(0.5 * m);
        expect(still).toBe(false);
        expect(moved).toBe(true);
    });

    it('sem traçado do mesmo objeto em volta (outro objeto, pixel fora dos 3 × 3, texel nunca traçado) não se sabe', () => {
        // Arrange
        const rep: P2 = [10, 10];
        const far: P3 = [100, 100, 100];
        const others: Trace[] = [
            { pixel: rep, tag: traceTag(4, [0, 0]), point: [0, 0, 0] },
            { pixel: [12, 10], tag: traceTag(3, [0, 0]), point: [0, 0, 0] },
            { pixel: [10, 11], tag: 0, point: [0, 0, 0] },
        ];

        // Act
        const changed = blockChanged(rep, [0, 0], far, 3, 1, others);

        // Assert
        expect(changed).toBe(false);
    });

    it('a mais perto discorda e a segunda concorda (a curva da imagem na borda de uma lente): não mudou', () => {
        // Arrange
        const rep: P2 = [10, 10];
        const m = 1;
        const end: P3 = [10.5, 10.5, 0];
        const near: Trace = { pixel: rep, tag: traceTag(3, [0.05, 0]), point: [10.6, 11.5, 0] };
        const next: Trace = {
            pixel: [11, 10],
            tag: traceTag(3, [-0.5, 0]),
            point: [11.05, 10.5, 0],
        };

        // Act
        const alone = blockChanged(rep, [0, 0], end, 3, m, [near]);
        const confirmed = blockChanged(rep, [0, 0], end, 3, m, [near, next]);

        // Assert
        expect(alone).toBe(true);
        expect(confirmed).toBe(false);
    });

    it('a mudança pede a discordância num traçado anterior do bloco (o bit 30 da etiqueta)', () => {
        // Arrange
        const previous = [traceTag(3, [0, 0]), traceTag(3, [0, 0], true)].map(
            (t) => (t & 0x40000000) !== 0,
        );

        // Act
        const once = blockChange(true, [false, false]);
        const twice = blockChange(true, previous);
        const agree = blockChange(false, previous);

        // Assert
        expect(previous).toEqual([false, true]);
        expect([agree, once, twice]).toEqual([0, 1, 2]);
    });
});
