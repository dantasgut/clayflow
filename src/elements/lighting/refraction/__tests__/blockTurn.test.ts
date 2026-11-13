import { describe, expect, it } from 'vitest';
import blockSource from '../../../gpu/wgsl/refraction/refraction_block.wgsl?raw';
import chainSource from '../../../gpu/wgsl/refraction/refraction_chain.wgsl?raw';

// A volta do representante pelo bloco 2×2 da refração em meia resolução (spec 039; spec 034, T060d): a validade do valor
// exato de um pixel (`REFRACTION_STAMP_FRAMES`) cobre o maior intervalo entre dois traçados dele — senão a imagem parada
// cai na reconstrução pelos vizinhos nos quadros sem o valor. A vez é a de `refraction_block_rep` e
// `refraction_block_turn`, com todos os pixels do bloco pedidos.

const ORDER = [0, 3, 2, 1]; // REFRACTION_BLOCK_ORDER: (0,0), (1,1), (1,0), (0,1) → índice x + 2y.

function constant(name: string): number {
    const m = new RegExp(`const ${name}: u32 = (\\d+)u;`).exec(chainSource);
    if (m === null) throw new Error(`${name} não encontrada`);
    return Number(m[1]);
}

/** A vez no bloco no quadro `f` (o índice em `ORDER`) e se o bloco de paridade `parity` é traçado nele. */
function turn(f: number, checkerboard: boolean): number {
    const plain = 3 * f + Math.floor(f / 16) + Math.floor(f / 64);
    const checker = 2 * f + Math.floor(f / 2) + Math.floor(f / 8) + Math.floor(f / 64);
    return (checkerboard ? checker : plain) % 4;
}
function traced(f: number, parity: number, checkerboard: boolean): boolean {
    return !checkerboard || ((parity + f + Math.floor(f / 8)) & 1) === 0;
}

/** O maior intervalo, em quadros, entre dois traçados de um mesmo pixel do bloco. */
function largestGap(checkerboard: boolean): number {
    let worst = 0;
    for (const parity of [0, 1])
        for (const pixel of ORDER) {
            let last: number | undefined;
            for (let f = 0; f < 8192; f++) {
                if (!traced(f, parity, checkerboard) || ORDER[turn(f, checkerboard)] !== pixel)
                    continue;
                if (last !== undefined) worst = Math.max(worst, f - last);
                last = f;
            }
        }
    return worst;
}

/** Halton na base `b` (a posição da amostra do antisserrilhado temporal, `pixelJitter`). */
function halton(i: number, b: number): number {
    let f = 1;
    let r = 0;
    for (let k = i; k > 0; k = Math.floor(k / b)) {
        f /= b;
        r += f * (k % b);
    }
    return r;
}

/**
 * O maior erro da cobertura de uma borda reta (vertical ou horizontal, em passos de 1/32 de pixel) pelas posições da
 * amostra que cada pixel do bloco recebe em `frames` quadros com a sequência de `sequence` posições começando na fase
 * `phase` do quadro da refração — o pixel integra a cena só pelas posições dos quadros em que é traçado.
 */
function edgeCoverageError(
    checkerboard: boolean,
    sequence: number,
    phase: number,
    frames: number,
): number {
    let worst = 0;
    for (const parity of [0, 1])
        for (const pixel of ORDER) {
            const xs: number[] = [];
            const ys: number[] = [];
            for (let t = 0; t < frames; t++) {
                const f = t + phase;
                if (!traced(f, parity, checkerboard) || ORDER[turn(f, checkerboard)] !== pixel)
                    continue;
                const i = (t % sequence) + 1;
                xs.push(halton(i, 2));
                ys.push(halton(i, 3));
            }
            for (let e = 0; e <= 1; e += 1 / 32)
                for (const s of [xs, ys])
                    worst = Math.max(worst, Math.abs(s.filter((v) => v < e).length / s.length - e));
        }
    return worst;
}

describe('refração em meia resolução — a volta do representante', () => {
    it('a vez do shader é a deste teste', () => {
        expect(blockSource).toContain('let plain = 3u * f + f / 16u + f / 64u;');
        expect(blockSource).toContain('let checker = 2u * f + f / 2u + f / 8u + f / 64u;');
        expect(blockSource).toContain('select(plain, checker, refraction.checkerboard != 0u) % 4u');
        expect(blockSource).toContain('((b.x + b.y + f + f / 8u) & 1u) == 0u');
    });

    it('o valor exato vale até o próximo traçado do pixel', () => {
        expect(largestGap(false)).toBe(6);
        expect(largestGap(true)).toBe(11);
        expect(constant('REFRACTION_STAMP_FRAMES')).toBeGreaterThanOrEqual(largestGap(false));
        expect(constant('REFRACTION_STAMP_FRAMES_CHECKER')).toBeGreaterThanOrEqual(
            largestGap(true),
        );
    });

    it('cada pixel recebe posições da amostra espalhadas pelo pixel nos dois eixos, em qualquer fase', () => {
        // Arrange: as fases entre o quadro da refração e a sequência das posições (a sequência começa onde o motor
        // estiver; o smoke `refraction` acumula 256 quadros de uma sequência de 256).
        const phases = [0, 1, 2, 3, 5, 7, 13, 50, 101, 200];
        // Act
        const plain = Math.max(...phases.map((p) => edgeCoverageError(false, 256, p, 256)));
        const plain64 = Math.max(...phases.map((p) => edgeCoverageError(false, 64, p, 256)));
        const checker = Math.max(...phases.map((p) => edgeCoverageError(true, 256, p, 256)));
        const checker64 = Math.max(...phases.map((p) => edgeCoverageError(true, 64, p, 256)));
        // Assert: pela soma dos dígitos na base 4 (antes) eram 0,30–0,42 sem xadrez e 0,44–0,69 em xadrez na sequência
        // de 64.
        expect(plain).toBeLessThanOrEqual(0.07);
        expect(plain64).toBeLessThanOrEqual(0.07);
        expect(checker).toBeLessThanOrEqual(0.23);
        expect(checker64).toBeLessThanOrEqual(0.17);
    });
});
