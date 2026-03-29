/**
 * FEMGraphColorSolver — coloração de grafo greedy para elementos tetraédricos.
 *
 * Dois elementos T4 conflitam se compartilham qualquer nó (até 4 nós por elemento).
 * Elementos da mesma cor são independentes e podem ser resolvidos em paralelo pela GPU.
 *
 * ## Algoritmo
 *
 * Greedy sequencial com bitmask de cores proibidas por nó:
 *   - Para cada elemento (n0,n1,n2,n3): encontra o menor c tal que
 *     nenhum dos 4 nós já usa a cor c.
 *   - Suporta até 32 cores (bitmask u32).
 *
 * Para tetraedros regulares (malha volumétrica uniforme), o número de cores
 * esperado é ≤ 5 (número cromático típico para grafos de tetraedros).
 *
 * ## Complexidade
 *
 * O(E × 4) onde E = número de elementos, com lookup O(1) por bitmask.
 *
 * @param elements   — array de elementos com índices de nós
 * @param nodeCount  — número de nós (define tamanho do array de bitmasks)
 * @returns elementos reordenados por cor + colorRanges com offset e count
 */

export interface FEMColorRange {
    offset: number;
    count:  number;
}

export interface FEMColorResult {
    /** Elementos reordenados: todos da cor 0, depois cor 1, etc. */
    sortedIndices: number[];
    /** Um entry por cor com offset e count no array sorted. */
    colorRanges:   FEMColorRange[];
    /** Cor de cada elemento na ordem original (para debugging). */
    elemColors:    Int32Array;
}

export interface FEMElementIndices {
    n0: number; n1: number; n2: number; n3: number;
}

export function graphColorFEMElements(
    elements:  FEMElementIndices[],
    nodeCount: number,
): FEMColorResult {
    const n      = elements.length;
    const colors = new Int32Array(n).fill(-1);

    // usedColors[p] = bitmask de cores já usadas por elementos que tocam o nó p
    const usedColors = new Uint32Array(nodeCount);

    let numColors = 0;

    for (let k = 0; k < n; k++) {
        const e = elements[k]!;
        const forbidden = usedColors[e.n0]! | usedColors[e.n1]!
                        | usedColors[e.n2]! | usedColors[e.n3]!;

        // Menor bit não setado = menor cor disponível
        let color = 0;
        while ((forbidden >>> color) & 1) color++;

        colors[k] = color;
        const bit = 1 << color;
        usedColors[e.n0]! |= bit;
        usedColors[e.n1]! |= bit;
        usedColors[e.n2]! |= bit;
        usedColors[e.n3]! |= bit;
        if (color >= numColors) numColors = color + 1;
    }

    // Agrupa índices por cor
    const groups: number[][] = Array.from({ length: numColors }, () => []);
    for (let k = 0; k < n; k++) {
        groups[colors[k]!]!.push(k);
    }

    // Serializa em array único com ranges
    const sortedIndices: number[]       = [];
    const colorRanges:   FEMColorRange[] = [];
    let offset = 0;
    for (const group of groups) {
        colorRanges.push({ offset, count: group.length });
        for (const idx of group) sortedIndices.push(idx);
        offset += group.length;
    }

    return { sortedIndices, colorRanges, elemColors: colors };
}
