import { Geometry } from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';

/**
 * Geometria de arestas com expansão em quad para linhas espessas. (Camada 3)
 *
 * Converte uma geometria indexada (triângulos) em um buffer de vértices de quads
 * para renderização com `triangle-list`. Cada aresta se torna dois triângulos.
 *
 * Layout por vértice: posA(3) + posB(3) + side(1) = 7 floats
 *
 * No shader WGSL, projeta posA e posB para NDC, computa a perpendicular em
 * espaço de tela e desloca ±(lineWidth / screenHeight) com base em `side`.
 *
 * @example
 * const geo  = new EdgeGeometry(new BoxGeometry());
 * const mat  = new ThickWireframeDecorator(new StandardMaterial({ color: [0, 1, 0, 1] }), 2.0);
 * scene.add(new Mesh(geo, mat));
 */
export class EdgeGeometry extends Geometry {
    constructor(source: Geometry) {
        super();
        this.build(source);
    }

    private build(source: Geometry): void {
        const { rawVertices, rawIndices, layout } = source;
        if (!rawVertices || !rawIndices) return;

        const posAttr = layout.attributes.find(a => a.name === 'position');
        if (!posAttr) return;

        const strideF  = layout.stride / 4;       // stride em floats
        const posOffF  = posAttr.byteOffset / 4;  // offset da posição em floats

        const getPos = (i: number): [number, number, number] => {
            const base = i * strideF + posOffF;
            return [rawVertices[base]!, rawVertices[base + 1]!, rawVertices[base + 2]!];
        };

        // Coleta arestas únicas (ordem canônica: índice menor primeiro)
        const seen  = new Set<string>();
        const edges: [number, number][] = [];

        const addEdge = (a: number, b: number): void => {
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (!seen.has(key)) {
                seen.add(key);
                edges.push(a < b ? [a, b] : [b, a]);
            }
        };

        for (let i = 0; i < rawIndices.length; i += 3) {
            const a = rawIndices[i]!, b = rawIndices[i + 1]!, c = rawIndices[i + 2]!;
            addEdge(a, b);
            addEdge(b, c);
            addEdge(a, c);
        }

        // 6 vértices por aresta (2 triângulos), 7 floats por vértice
        const vertices = new Float32Array(edges.length * 6 * 7);
        let vi = 0;

        const push = (
            ax: number, ay: number, az: number,
            bx: number, by: number, bz: number,
            side: number,
        ): void => {
            vertices[vi++] = ax; vertices[vi++] = ay; vertices[vi++] = az;
            vertices[vi++] = bx; vertices[vi++] = by; vertices[vi++] = bz;
            vertices[vi++] = side;
        };

        for (const [ia, ib] of edges) {
            const [ax, ay, az] = getPos(ia);
            const [bx, by, bz] = getPos(ib);
            // Triângulo 1: canto A-esq, A-dir, B-esq
            push(ax, ay, az, bx, by, bz, -1);
            push(ax, ay, az, bx, by, bz, +1);
            push(bx, by, bz, ax, ay, az, -1);
            // Triângulo 2: A-dir, B-dir, B-esq
            push(ax, ay, az, bx, by, bz, +1);
            push(bx, by, bz, ax, ay, az, +1);
            push(bx, by, bz, ax, ay, az, -1);
        }

        this.rawVertices = vertices;
        this.rawIndices  = null;
        this.vertexCount = edges.length * 6;
        this.layout = new VertexLayout([
            { name: 'posA', format: 'float32x3', shaderLocation: 0 },
            { name: 'posB', format: 'float32x3', shaderLocation: 1 },
            { name: 'side', format: 'float32',   shaderLocation: 2 },
        ]);
    }
}
