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

/** O maior intervalo, em quadros, entre dois traçados de um mesmo pixel do bloco. */
function largestGap(checkerboard: boolean): number {
    let worst = 0;
    for (const parity of [0, 1])
        for (const pixel of ORDER) {
            let last: number | undefined;
            for (let f = 0; f < 8192; f++) {
                if (checkerboard && ((parity + f + Math.floor(f / 32)) & 1) !== 0) continue;
                const digits =
                    f + [4, 16, 64, 256, 1024].reduce((s, b) => s + Math.floor(f / b), 0);
                const start = (checkerboard ? Math.floor(f / 2) + Math.floor(f / 8) : digits) % 4;
                if (ORDER[start] !== pixel) continue;
                if (last !== undefined) worst = Math.max(worst, f - last);
                last = f;
            }
        }
    return worst;
}

describe('refração em meia resolução — a volta do representante', () => {
    it('a vez do shader é a deste teste', () => {
        expect(blockSource).toContain(
            'let digits = f + f / 4u + f / 16u + f / 64u + f / 256u + f / 1024u;',
        );
        expect(blockSource).toContain(
            'select(digits, f / 2u + f / 8u, refraction.checkerboard != 0u) % 4u',
        );
        expect(blockSource).toContain('((b.x + b.y + f + f / 32u) & 1u) == 0u');
    });

    it('o valor exato vale até o próximo traçado do pixel', () => {
        expect(largestGap(false)).toBe(7);
        expect(largestGap(true)).toBe(15);
        expect(constant('REFRACTION_STAMP_FRAMES')).toBeGreaterThanOrEqual(largestGap(false));
        expect(constant('REFRACTION_STAMP_FRAMES_CHECKER')).toBeGreaterThanOrEqual(
            largestGap(true),
        );
    });
});
