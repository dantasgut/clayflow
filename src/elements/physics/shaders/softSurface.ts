import { wgslModule } from '../../../scene/shaders/WgslModule';
import softFaceNormalsSource from '../../gpu/wgsl/kernels/soft_face_normals.wgsl?raw';
import softVertexWriteSource from '../../gpu/wgsl/kernels/soft_vertex_write.wgsl?raw';
import { SoftSurfaceParamsSchema } from '../schemas/softSurface';

// Kernels da superfície de corpo mole (spec 008): normais de face e escrita dos vértices.

/** Normal (ponderada pela área) de cada triângulo. */
export const softFaceNormals = wgslModule({
    name: 'soft_face_normals',
    source: softFaceNormalsSource,
    structs: [SoftSurfaceParamsSchema],
});

/** Posição e normal média de cada vértice no vertex buffer da geometria. */
export const softVertexWrite = wgslModule({
    name: 'soft_vertex_write',
    source: softVertexWriteSource,
    structs: [SoftSurfaceParamsSchema],
});
