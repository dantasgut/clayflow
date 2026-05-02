/**
 * Aresta entre dois vértices em um grafo de constraints. Usada pelo
 * `GraphColorSolver` para colorir constraints de física que devem ser
 * resolvidas em paralelo (constraints adjacentes ao mesmo vértice
 * conflitam e devem ter cores diferentes).
 */
export interface Edge {
    /** Primeiro vértice da aresta (índice em algum pool de partículas). */
    readonly a: number;
    /** Segundo vértice da aresta. */
    readonly b: number;
}

/**
 * GraphColorSolver — Greedy graph coloring para batch parallel
 * constraint solver em XPBD/PBD. Atribui a cada aresta uma "cor"
 * (inteiro ≥ 0) tal que arestas adjacentes (compartilhando vértice)
 * têm cores diferentes.
 *
 * Constraints com mesma cor podem ser resolvidas em paralelo na GPU
 * (não há writes conflitantes em vértices). Algorithm Greedy:
 * O(E + V·max_color), serial CPU; max_color ≤ 1 + max degree.
 *
 * Usado em construct phase de XPBD/FEM para gerar batches de constraints
 * paralelizáveis (cada cor = um dispatch separado).
 */
export class GraphColorSolver {
    /**
     * Atribui cores às arestas para batch parallel solve. Returns
     * Uint32Array onde `result[i]` é a cor (inteiro ≥ 0) da aresta `edges[i]`.
     */
    static color(edges: readonly Edge[]): Uint32Array {
        const colors = new Uint32Array(edges.length);
        const lastColorPerVertex = new Map<number, Set<number>>();
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (edge === undefined) continue;
            const usedA = lastColorPerVertex.get(edge.a) ?? new Set<number>();
            const usedB = lastColorPerVertex.get(edge.b) ?? new Set<number>();
            let c = 0;
            while (usedA.has(c) || usedB.has(c)) c++;
            colors[i] = c;
            usedA.add(c);
            usedB.add(c);
            lastColorPerVertex.set(edge.a, usedA);
            lastColorPerVertex.set(edge.b, usedB);
        }
        return colors;
    }

    /**
     * Retorna o número total de cores usadas (= max color + 1). O solver
     * dispatcha N passes (1 por cor) para resolver todos os constraints.
     */
    static maxColor(colors: Uint32Array): number {
        let max = 0;
        for (let i = 0; i < colors.length; i++) {
            const v = colors[i];
            if (v !== undefined && v > max) max = v;
        }
        return max + 1;
    }
}
