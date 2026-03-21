import { Geometry } from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';

/**
 * Primitiva amigável geradora de Cubos. (Camada 3)
 * O desenvolvedor instancia na CPU e ela preenche suas propriedades `rawVertices`.
 */
export class BoxGeometry extends Geometry {
    private width: number;
    private height: number;
    private depth: number;

    constructor(width: number = 1, height: number = 1, depth: number = 1) {
        super();
        this.width = width;
        this.height = height;
        this.depth = depth;
        
        this.buildGeometry();
    }

    private buildGeometry(): void {
        const w = this.width / 2;
        const h = this.height / 2;
        const d = this.depth / 2;

        // Formato: [Px, Py, Pz,  Nx, Ny, Nz,  U, V]
        const vertices = new Float32Array([
            // Front Face
            -w, -h,  d,   0,  0,  1,   0, 0,
             w, -h,  d,   0,  0,  1,   1, 0,
             w,  h,  d,   0,  0,  1,   1, 1,
            -w,  h,  d,   0,  0,  1,   0, 1,

            // Back Face
             w, -h, -d,   0,  0, -1,   0, 0,
            -w, -h, -d,   0,  0, -1,   1, 0,
            -w,  h, -d,   0,  0, -1,   1, 1,
             w,  h, -d,   0,  0, -1,   0, 1,

            // Top Face
            -w,  h,  d,   0,  1,  0,   0, 0,
             w,  h,  d,   0,  1,  0,   1, 0,
             w,  h, -d,   0,  1,  0,   1, 1,
            -w,  h, -d,   0,  1,  0,   0, 1,

            // Bottom Face
            -w, -h, -d,   0, -1,  0,   0, 0,
             w, -h, -d,   0, -1,  0,   1, 0,
             w, -h,  d,   0, -1,  0,   1, 1,
            -w, -h,  d,   0, -1,  0,   0, 1,

            // Right Face
             w, -h,  d,   1,  0,  0,   0, 0,
             w, -h, -d,   1,  0,  0,   1, 0,
             w,  h, -d,   1,  0,  0,   1, 1,
             w,  h,  d,   1,  0,  0,   0, 1,

            // Left Face
            -w, -h, -d,  -1,  0,  0,   0, 0,
            -w, -h,  d,  -1,  0,  0,   1, 0,
            -w,  h,  d,  -1,  0,  0,   1, 1,
            -w,  h, -d,  -1,  0,  0,   0, 1,
        ]);

        const indices = new Uint32Array([
            0,  1,  2,      0,  2,  3,    // front
            4,  5,  6,      4,  6,  7,    // back
            8,  9,  10,     8,  10, 11,   // top
            12, 13, 14,     12, 14, 15,   // bottom
            16, 17, 18,     16, 18, 19,   // right
            20, 21, 22,     20, 22, 23,   // left
        ]);

        this.rawVertices = vertices;
        this.rawIndices  = indices;

        // Wireframe: 8 cantos únicos do cubo + 12 arestas reais (sem diagonais de triangulação).
        // As posições do VBO principal são duplicadas por face (normais diferentes);
        // aqui usamos os 8 cantos geométricos únicos.
        this.rawWireframePositions = new Float32Array([
            -w, -h,  d,   // 0 — frente-baixo-esquerda
             w, -h,  d,   // 1 — frente-baixo-direita
             w,  h,  d,   // 2 — frente-cima-direita
            -w,  h,  d,   // 3 — frente-cima-esquerda
             w, -h, -d,   // 4 — trás-baixo-direita
            -w, -h, -d,   // 5 — trás-baixo-esquerda
            -w,  h, -d,   // 6 — trás-cima-esquerda
             w,  h, -d,   // 7 — trás-cima-direita
        ]);
        this.rawWireframeEdges = new Uint32Array([
            0, 1,  1, 2,  2, 3,  3, 0,   // face frontal
            4, 5,  5, 6,  6, 7,  7, 4,   // face traseira
            0, 5,  1, 4,  2, 7,  3, 6,   // arestas laterais
        ]);

        this.layout = new VertexLayout([
            { name: 'position', format: 'float32x3', shaderLocation: 0 },
            { name: 'normal',   format: 'float32x3', shaderLocation: 1 },
            { name: 'uv',       format: 'float32x2', shaderLocation: 2 }
        ]);

        this.vertexCount = indices.length;
    }
}
