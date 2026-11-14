import { describe, expect, it } from 'vitest';
import { ParticlePhysics } from '../../ParticlePhysics';
import { looseDrop, openFraction } from '../looseDrop';

const S = 0.025;
const SUPPORT = 2 * S;

/** Vizinhas de uma rede cúbica de espaçamento S dentro do alcance de `p`, só as com y ≥ `floor` (o sólido abaixo). */
function latticeNeighbors(p: readonly [number, number, number], floor: number): number {
    let n = 0;
    const r = Math.ceil(SUPPORT / S) + 1;
    for (let i = -r; i <= r; i++)
        for (let j = -r; j <= r; j++)
            for (let k = -r; k <= r; k++) {
                const q = [p[0] + i * S, p[1] + j * S, p[2] + k * S] as const;
                const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
                if (d === 0 || d >= SUPPORT || q[1] < floor) continue;
                n++;
            }
    return n;
}

describe('gota solta pela parte aberta da vizinhança (T066d)', () => {
    it('a fração aberta da esfera cortada por um plano', () => {
        expect(openFraction(SUPPORT, SUPPORT)).toBe(1);
        expect(openFraction(0, SUPPORT)).toBeCloseTo(0.5, 12);
        // Contra a integração numérica da calota.
        for (const x of [0.1, 0.3, 0.6, 0.9]) {
            const steps = 20000;
            let cap = 0;
            for (let s = 0; s < steps; s++) {
                const z = x + ((s + 0.5) / steps) * (1 - x);
                cap += Math.PI * (1 - z * z) * ((1 - x) / steps);
            }
            expect(openFraction(x * SUPPORT, SUPPORT)).toBeCloseTo(
                1 - cap / ((4 / 3) * Math.PI),
                6,
            );
        }
    });

    it('o volume junto da parede é volume; a gota pousada segue gota', () => {
        const threshold = ParticlePhysics.WET_NEIGHBORS;
        // Partícula do volume encostada no chão (centro a meio espaçamento): as vizinhas da rede acima dele.
        const wall = S / 2;
        const inVolume = latticeNeighbors([0, wall, 0], 0);
        expect(looseDrop(inVolume, threshold, wall, SUPPORT)).toBe(false);
        // Na linha de contato do topo do volume com a parede: metade de cima vazia também.
        const corner = latticeNeighbors([0, wall, 0], 0) / 2;
        expect(looseDrop(Math.floor(corner), threshold, wall, SUPPORT)).toBe(false);
        // A gota de uma partícula pousada: nenhuma vizinha.
        expect(looseDrop(0, threshold, wall, SUPPORT)).toBe(true);
        // No ar, longe do sólido, o limite inteiro; desligado com 0.
        expect(looseDrop(threshold - 1, threshold, undefined, SUPPORT)).toBe(true);
        expect(looseDrop(0, 0, wall, SUPPORT)).toBe(false);
    });
});
