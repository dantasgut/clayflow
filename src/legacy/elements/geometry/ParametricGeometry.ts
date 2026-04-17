import { Geometry } from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';

export interface ParametricVertex {
    position: [number, number, number];
    normal:   [number, number, number];
    uv:       [number, number];
}

/**
 * Geometria gerada por função paramétrica f(u, v) → vértice. (Camada 3)
 *
 * Ponte entre fórmulas matemáticas e buffers GPU.
 * O usuário fornece a função de superfície; esta classe gera a malha
 * triangulada e os índices automaticamente.
 *
 * u ∈ [0, 1] e v ∈ [0, 1] — mapeados sobre uma grade de (uSegments × vSegments).
 *
 * @example
 * // Toro
 * new ParametricGeometry((u, v) => {
 *     const theta = u * Math.PI * 2;
 *     const phi   = v * Math.PI * 2;
 *     const R = 1.0, r = 0.3;
 *     return {
 *         position: [(R + r*Math.cos(phi))*Math.cos(theta), r*Math.sin(phi), (R + r*Math.cos(phi))*Math.sin(theta)],
 *         normal:   [Math.cos(phi)*Math.cos(theta), Math.sin(phi), Math.cos(phi)*Math.sin(theta)],
 *         uv:       [u, v],
 *     };
 * }, 64, 32);
 */
export class ParametricGeometry extends Geometry {
    constructor(
        fn: (u: number, v: number) => ParametricVertex,
        uSegments: number = 32,
        vSegments: number = 16,
    ) {
        super();
        this.build(fn, uSegments, vSegments);
    }

    private build(
        fn: (u: number, v: number) => ParametricVertex,
        uSegs: number,
        vSegs: number,
    ): void {
        const uStride  = uSegs + 1;
        const vStride  = vSegs + 1;
        // position(3) + normal(3) + uv(2) = 8 floats por vértice
        const vertices = new Float32Array(uStride * vStride * 8);
        const indices  = new Uint32Array(uSegs * vSegs * 6);

        let vi = 0;
        for (let j = 0; j <= vSegs; j++) {
            for (let i = 0; i <= uSegs; i++) {
                const { position, normal, uv } = fn(i / uSegs, j / vSegs);
                vertices[vi++] = position[0];
                vertices[vi++] = position[1];
                vertices[vi++] = position[2];
                vertices[vi++] = normal[0];
                vertices[vi++] = normal[1];
                vertices[vi++] = normal[2];
                vertices[vi++] = uv[0];
                vertices[vi++] = uv[1];
            }
        }

        let ii = 0;
        for (let j = 0; j < vSegs; j++) {
            for (let i = 0; i < uSegs; i++) {
                const a = j * uStride + i;
                const b = j * uStride + i + 1;
                const c = (j + 1) * uStride + i + 1;
                const d = (j + 1) * uStride + i;
                indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
                indices[ii++] = a; indices[ii++] = c; indices[ii++] = d;
            }
        }

        this.rawVertices = vertices;
        this.rawIndices  = indices;
        this.vertexCount = indices.length;

        // Wireframe: extrai arestas únicas do IBO.
        // Para geometrias paramétricas (esfera, toro, etc.) todos os triângulos adjacentes
        // têm normais diferentes (superfície curva), portanto cada aresta no IBO é real.
        // Deduplicação basta — nenhuma aproximação por ângulo é necessária.
        const edgeSet = new Map<number, true>();
        const edgeList: number[] = [];
        const totalVerts = uStride * vStride;
        for (let k = 0; k < indices.length; k += 3) {
            const tri = [indices[k]!, indices[k + 1]!, indices[k + 2]!] as const;
            for (let e = 0; e < 3; e++) {
                const a = tri[e]!;
                const b = tri[(e + 1) % 3]!;
                const key = Math.min(a, b) * totalVerts + Math.max(a, b);
                if (!edgeSet.has(key)) {
                    edgeSet.set(key, true);
                    edgeList.push(a, b);
                }
            }
        }

        // Posições wireframe = posições do VBO principal (stride 8, posOffset 0)
        const wfPos: number[] = [];
        for (let i = 0; i < uStride * vStride; i++) {
            wfPos.push(vertices[i * 8]!, vertices[i * 8 + 1]!, vertices[i * 8 + 2]!);
        }
        this.rawWireframePositions = new Float32Array(wfPos);
        this.rawWireframeEdges     = new Uint32Array(edgeList);
        this.layout = new VertexLayout([
            { name: 'position', format: 'float32x3', shaderLocation: 0 },
            { name: 'normal',   format: 'float32x3', shaderLocation: 1 },
            { name: 'uv',       format: 'float32x2', shaderLocation: 2 },
        ]);
    }
}
