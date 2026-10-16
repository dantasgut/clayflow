import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import softFaceNormalsSource from '../../gpu/wgsl/kernels/soft_face_normals.wgsl?raw';
import softVertexWriteSource from '../../gpu/wgsl/kernels/soft_vertex_write.wgsl?raw';
import { MeshVertexSchema } from '../../geometry/MeshVertexSchema';
import { SoftSurfaceParamsSchema } from '../schemas/softSurface';

// Kernels da superfície de corpo mole (spec 008): normais de face e escrita dos vértices.

const buffer = (
    name: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

/**
 * Recursos da superfície de corpo mole (spec 031), ligados pelo estágio por corpo: os parâmetros (uma região por
 * corpo, offset dinâmico), o pool de partículas lido em `vec4f`, os índices e a adjacência da geometria, as normais de
 * face (escritas por um kernel, lidas pelo outro) e o vertex buffer da geometria.
 */
export const softSurfaceResources = Object.freeze({
    surface: wgslResource({
        name: 'surface',
        binding: { uniform: true },
        type: { schema: SoftSurfaceParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    particles: buffer('particles', 'read', { wgsl: 'vec4f', array: true }),
    indices: buffer('indices', 'read', { wgsl: 'u32', array: true }),
    adjacency: buffer('adjacency', 'read', { wgsl: 'u32', array: true }),
    faceNormalsWrite: buffer('face_normals', 'read_write', { wgsl: 'vec4f', array: true }),
    faceNormalsRead: buffer('face_normals', 'read', { wgsl: 'vec4f', array: true }),
    vertices: buffer('vertices', 'read_write', { schema: MeshVertexSchema, array: true }),
});

const R = softSurfaceResources;

/** Normal (ponderada pela área) de cada triângulo. */
export const softFaceNormals = wgslModule({
    name: 'soft_face_normals',
    source: softFaceNormalsSource,
    requires: [WORKGROUP_SIZE.module, R.surface, R.particles, R.indices, R.faceNormalsWrite],
});

/** Posição e normal média de cada vértice no vertex buffer da geometria. */
export const softVertexWrite = wgslModule({
    name: 'soft_vertex_write',
    source: softVertexWriteSource,
    requires: [
        WORKGROUP_SIZE.module,
        R.surface,
        R.particles,
        R.adjacency,
        R.faceNormalsRead,
        R.vertices,
    ],
});
