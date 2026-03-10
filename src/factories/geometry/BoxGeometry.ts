import { Geometry } from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';

/**
 * Primitiva amigável geradora de Cubos.
 * O desenvolvedor instancia na CPU e ela se auto-compila na GPU no primeiro frame.
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
    }

    public compile(resourceManager: ResourceManager): void {
        if (this.isCompiled) return;

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

        const vertexBuffer = resourceManager.buffers.createVertexBuffer('box_vbo', vertices);
        const indexBuffer = resourceManager.buffers.createIndexBuffer('box_ibo', indices);

        this.layout = new VertexLayout([
            { name: 'position', format: 'float32x3', shaderLocation: 0 },
            { name: 'normal',   format: 'float32x3', shaderLocation: 1 },
            { name: 'uv',       format: 'float32x2', shaderLocation: 2 }
        ]);

        this.vertexBufferId = vertexBuffer.id;
        this.indexBufferId = indexBuffer.id;
        this.vertexCount = indices.length;
        this.isCompiled = true;
    }
}
