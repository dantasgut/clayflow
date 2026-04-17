/**
 * GraphColorSolver — coloração de grafo greedy para constraints de distância.
 *
 * Objetivo: atribuir a cada constraint uma "cor" tal que nenhumas duas constraints
 * da mesma cor compartilhem uma partícula. Constraints da mesma cor são
 * independentes e podem ser processadas em paralelo pela GPU.
 *
 * ## Algoritmo
 *
 * Greedy sequencial com bitmask de cores proibidas por partícula:
 *   - Para cada constraint (i, j): encontra o menor c tal que
 *     nem a partícula i nem j já usam a cor c.
 *   - Suporta até 32 cores (bitmask u32) — malhas cloth uniformes usam 4.
 *
 * ## Complexidade
 *
 * O(E × degree) onde E = número de arestas e degree = grau máximo do grafo.
 * Para cloth uniforme: degree ≤ 6, portanto efetivamente O(E).
 *
 * @param constraints  — constraints do SoftBody (não modificadas).
 * @param particleCount — número de partículas (define tamanho do array de bitmasks).
 * @returns sortedConstraints ordenadas por cor + colorRanges com offset e count por cor.
 */

import type { SoftConstraint } from '../SoftBody';

export interface ColorRange {
    offset: number;  // índice inicial no buffer de constraints (color-sorted)
    count:  number;  // número de constraints nesta cor
}

export interface GraphColorResult {
    /** Constraints reordenadas: todas as da cor 0, depois cor 1, etc. */
    sortedConstraints: SoftConstraint[];
    /** Um entry por cor com offset e count no buffer sortedConstraints. */
    colorRanges: ColorRange[];
}

export function graphColorConstraints(
    constraints:   SoftConstraint[],
    particleCount: number,
): GraphColorResult {
    const n      = constraints.length;
    const colors = new Int32Array(n).fill(-1);

    // usedColors[p] = bitmask das cores já usadas pelas constraints que tocam p
    const usedColors = new Uint32Array(particleCount);

    let numColors = 0;

    for (let k = 0; k < n; k++) {
        const c        = constraints[k]!;
        const forbidden = usedColors[c.i]! | usedColors[c.j]!;

        // Menor bit não setado = menor cor disponível
        let color = 0;
        while ((forbidden >>> color) & 1) color++;

        colors[k] = color;
        usedColors[c.i]! |= (1 << color);
        usedColors[c.j]! |= (1 << color);
        if (color >= numColors) numColors = color + 1;
    }

    // Agrupa constraints por cor
    const groups: SoftConstraint[][] = Array.from({ length: numColors }, () => []);
    for (let k = 0; k < n; k++) {
        groups[colors[k]!]!.push(constraints[k]!);
    }

    // Serializa em array único com ranges
    const sortedConstraints: SoftConstraint[] = [];
    const colorRanges: ColorRange[]            = [];
    let offset = 0;
    for (const group of groups) {
        colorRanges.push({ offset, count: group.length });
        for (const sc of group) sortedConstraints.push(sc);
        offset += group.length;
    }

    return { sortedConstraints, colorRanges };
}
