import { Geometry }     from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';

/**
 * Geometria de nuvem de pontos — N vértices sem índices.
 *
 * Cada vértice representa uma partícula. As posições são escritas em runtime
 * por um compute shader (ex: `mpm_vertex_write`) via `vertexBufferId`.
 *
 * Stride: 8 floats (pos.xyz + normal.xyz + uv.xy) — compatível com
 * `MPM_VERTEX_STRIDE = 8` no kernel mpm_vertex_write.wgsl.
 *
 * Para renderização visível use um material com `topology = 'point-list'`.
 */
export class PointCloudGeometry extends Geometry {
    constructor(count: number) {
        super();
        this.layout = new VertexLayout([
            { name: 'position', format: 'float32x3', shaderLocation: 0 },
            { name: 'normal',   format: 'float32x3', shaderLocation: 1 },
            { name: 'uv',       format: 'float32x2', shaderLocation: 2 },
        ]);
        this.vertexCount = count;
        // Inicializa vértices em origem — posições sobrescritas pelo compute shader.
        this.rawVertices = new Float32Array(count * 8);
    }
}
