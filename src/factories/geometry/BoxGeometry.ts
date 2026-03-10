import { Geometry } from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';
import type { IResourceManager } from '../../core/interfaces/IResourceManager';
import type { IGeometryBuilder } from './IGeometryBuilder';

/**
 * Fábrica OCP para gerar a primitiva Box/Cubo.
 * Calcula os vértices programaticamente baseados em dimensões, injeta
 * na VRAM e devolve a entidade Componente Geometry.
 */
export class BoxGeometry implements IGeometryBuilder {
    private width: number;
    private height: number;
    private depth: number;

    constructor(width: number = 1, height: number = 1, depth: number = 1) {
        this.width = width;
        this.height = height;
        this.depth = depth;
    }

    public build(resourceManager: IResourceManager): Geometry {
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

        // Assinamos o Layout estrito da Engine
        const layout = new VertexLayout([
            { name: 'position', format: 'float32x3', shaderLocation: 0 },
            { name: 'normal',   format: 'float32x3', shaderLocation: 1 },
            { name: 'uv',       format: 'float32x2', shaderLocation: 2 }
        ]);

        // A Camada 3 se comunica com a Camada 1 (Hardware) gerando o buffer
        // Note: IResourceManager assumes 'buffers' object as per implementation.
        const vertexBuffer = resourceManager.buffers.createVertexBuffer('box_vbo', vertices);
        const indexBuffer = resourceManager.buffers.createIndexBuffer('box_ibo', indices);

        return new Geometry(vertexBuffer.id, layout, indices.length, indexBuffer.id);
    }
}
