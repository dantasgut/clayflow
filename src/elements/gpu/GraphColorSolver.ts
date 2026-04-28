export interface Edge {
    readonly a: number;
    readonly b: number;
}

export class GraphColorSolver {
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

    static maxColor(colors: Uint32Array): number {
        let max = 0;
        for (let i = 0; i < colors.length; i++) {
            const v = colors[i];
            if (v !== undefined && v > max) max = v;
        }
        return max + 1;
    }
}
