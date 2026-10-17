import { wgslModule } from '../../scene/shaders/WgslModule';
import {
    wgslResource,
    type WgslResource,
    type WgslResourceType,
} from '../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import rayCommonSource from '../gpu/wgsl/raytrace/ray_common.wgsl?raw';
import rayGatherSource from '../gpu/wgsl/raytrace/ray_gather.wgsl?raw';
import rayBoundsSource from '../gpu/wgsl/raytrace/ray_bounds.wgsl?raw';
import rayPrimBoxSource from '../gpu/wgsl/raytrace/ray_prim_box.wgsl?raw';
import rayReduceSource from '../gpu/wgsl/raytrace/ray_reduce.wgsl?raw';
import rayMortonSource from '../gpu/wgsl/raytrace/ray_morton.wgsl?raw';
import rayLbvhSource from '../gpu/wgsl/raytrace/ray_lbvh.wgsl?raw';
import rayRefitSource from '../gpu/wgsl/raytrace/ray_refit.wgsl?raw';
import rayReorderSource from '../gpu/wgsl/raytrace/ray_reorder.wgsl?raw';
import rayInstancesSource from '../gpu/wgsl/raytrace/ray_instances.wgsl?raw';
import raySceneSource from '../gpu/wgsl/raytrace/ray_scene.wgsl?raw';
import rayGeometryReadSource from '../gpu/wgsl/raytrace/ray_geometry_read.wgsl?raw';
import rayBvhReadSource from '../gpu/wgsl/raytrace/ray_bvh_read.wgsl?raw';
import { MeshVertexSchema } from '../geometry/MeshVertexSchema';
import { worldsResource } from '../scene/resources';
import {
    RayBuildParamsSchema,
    RayBvhSchema,
    RayGeometrySchema,
    RayInstanceSourceSchema,
    RaySceneSchema,
} from './schemas';
import { renderablesResource } from '../scene/resources';
import { standardMaterialsResource } from '../material/renderResources';
import { RenderableSchema } from '../scene/Renderable';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';

// Módulos da estrutura de raios (spec 033, R1): as funções comuns, os kernels da construção (privados do
// `RaySceneFlow`) e a consulta `ray_scene`, que qualquer estágio requer — os pools da `RayScene` e o uniform dela são
// fornecidos pela C2.

/** Constantes, Morton, ordem de floats e as interseções. */
export const rayCommon = wgslModule({
    name: 'ray_common',
    source: rayCommonSource,
    requires: [NONE.module],
});

const pool = (
    name: string,
    schema: WgslResourceType & { readonly schema: unknown },
    access: 'read' | 'read_write',
    frequency: 'frame' | 'stage',
): WgslResource =>
    wgslResource({
        name,
        binding: { storage: access },
        type: schema,
        frequency,
        provider: { pool: (schema.schema as { name: string }).name },
    });

/** O uniform da `RayScene` (resolver `RayScene.info`): as faixas nos pools e a raiz da hierarquia de cima. */
export const raySceneInfoResource = wgslResource({
    name: 'ray_scene_info',
    binding: { uniform: true },
    type: { schema: RaySceneSchema },
    frequency: 'frame',
    provider: { consumer: 'RayScene.info' },
});

/** Recursos da consulta: os dois pools da estrutura, leitura. */
export const raySceneResources = Object.freeze({
    geometry: pool('ray_geometry', { schema: RayGeometrySchema, array: true }, 'read', 'frame'),
    bvh: pool('ray_bvh', { schema: RayBvhSchema, array: true }, 'read', 'frame'),
});

/** Leitura da geometria (vértices, triângulos, esferas). */
const rayGeometryRead = wgslModule({
    name: 'ray_geometry_read',
    source: rayGeometryReadSource,
    requires: [rayCommon, raySceneResources.geometry],
});

/** Leitura da hierarquia (nós, hierarquias de baixo, instâncias). */
const rayBvhRead = wgslModule({
    name: 'ray_bvh_read',
    source: rayBvhReadSource,
    requires: [rayCommon, raySceneResources.bvh],
});

/**
 * Consulta da estrutura de raios: `ray_scene_hit(origin, dir, t_max) -> RayHit` e `ray_scene_occluded(origin, dir,
 * t_max) -> bool` (spec 033, FR-003). O contrato não expõe a origem da geometria; liga dois buffers de storage.
 */
export const rayScene = wgslModule({
    name: 'ray_scene',
    source: raySceneSource,
    requires: [rayCommon, rayGeometryRead, rayBvhRead, raySceneInfoResource],
});

/** Leitura das instâncias (o material copiado nelas), para quem sombreia os acertos. */
export const rayInstanceRead = rayBvhRead;

const priv = (name: string, access: 'read' | 'read_write', type: WgslResourceType): WgslResource =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

const poolStage = (
    name: string,
    schema: WgslResourceType & { readonly schema: unknown },
    access: 'read' | 'read_write',
): WgslResource => pool(name, schema, access, 'stage');

/**
 * Recursos da construção (privados do `RaySceneFlow`, ligados por hierarquia): os parâmetros (uma região por
 * hierarquia, offset dinâmico), a geometria de origem, os temporários (caixas, caixa do conjunto, chaves, valores, pais,
 * contadores, origens das instâncias) e os pools da estrutura em escrita.
 */
export const rayBuildResources = Object.freeze({
    build: wgslResource({
        name: 'build',
        binding: { uniform: true },
        type: { schema: RayBuildParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    srcVertices: priv('src_vertices', 'read', { schema: MeshVertexSchema, array: true }),
    srcIndices: priv('src_indices', 'read', { wgsl: 'u32', array: true }),
    srcIndirect: priv('src_indirect', 'read', { wgsl: 'u32', array: true }),
    srcParticles: priv('src_particles', 'read', { wgsl: 'vec4f', array: true }),
    aabbs: priv('ray_aabbs', 'read_write', { wgsl: 'vec4f', array: true }),
    aabbsRead: priv('ray_aabbs', 'read', { wgsl: 'vec4f', array: true }),
    bounds: priv('ray_bounds', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    boundsRead: priv('ray_bounds', 'read', { wgsl: 'u32', array: true }),
    keys: priv('ray_keys', 'read_write', { wgsl: 'u32', array: true }),
    keysRead: priv('ray_keys', 'read', { wgsl: 'u32', array: true }),
    values: priv('ray_values', 'read_write', { wgsl: 'u32', array: true }),
    valuesRead: priv('ray_values', 'read', { wgsl: 'u32', array: true }),
    parents: priv('ray_parents', 'read_write', { wgsl: 'u32', array: true }),
    parentsRead: priv('ray_parents', 'read', { wgsl: 'u32', array: true }),
    counters: priv('ray_counters', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    boxes: priv('ray_boxes', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    tris: priv('ray_tris', 'read_write', { wgsl: 'vec4u', array: true }),
    instanceSources: priv('ray_instance_sources', 'read', {
        schema: RayInstanceSourceSchema,
        array: true,
    }),
    geometryOut: poolStage(
        'ray_geometry_out',
        { schema: RayGeometrySchema, array: true },
        'read_write',
    ),
    bvhOut: poolStage('ray_bvh_out', { schema: RayBvhSchema, array: true }, 'read_write'),
});

const B = rayBuildResources;

/** Cópia dos vértices, dos triângulos e das partículas para os pools da estrutura. */
export const rayGather = wgslModule({
    name: 'ray_build_gather',
    source: rayGatherSource,
    requires: [
        WORKGROUP_SIZE.module,
        rayCommon,
        B.build,
        B.srcVertices,
        B.srcIndices,
        B.srcIndirect,
        B.srcParticles,
        B.geometryOut,
    ],
});

/** Caixa de uma primitiva (triângulo ou esfera). */
const rayPrimBox = wgslModule({
    name: 'ray_build_prim_box',
    source: rayPrimBoxSource,
    requires: [rayCommon, rayGeometryRead, B.build],
});

/** Caixa do conjunto reduzida no grupo de trabalho. */
const rayReduce = wgslModule({
    name: 'ray_build_reduce',
    source: rayReduceSource,
    requires: [WORKGROUP_SIZE.module, rayCommon, B.build, B.bounds],
});

/** Caixas das primitivas e a caixa do conjunto. */
export const rayBounds = wgslModule({
    name: 'ray_build_bounds',
    source: rayBoundsSource,
    requires: [WORKGROUP_SIZE.module, rayCommon, rayPrimBox, rayReduce, B.build, B.aabbs],
});

/** Códigos de Morton das primitivas. */
export const rayMorton = wgslModule({
    name: 'ray_build_morton',
    source: rayMortonSource,
    requires: [
        WORKGROUP_SIZE.module,
        rayCommon,
        B.build,
        B.aabbsRead,
        B.boundsRead,
        B.keys,
        B.values,
    ],
});

/** Hierarquia LBVH (nós internos e folhas). */
export const rayLbvh = wgslModule({
    name: 'ray_build_lbvh',
    source: rayLbvhSource,
    requires: [
        WORKGROUP_SIZE.module,
        rayCommon,
        B.build,
        B.keysRead,
        B.valuesRead,
        B.bvhOut,
        B.parents,
    ],
});

/** Caixas de baixo para cima. */
export const rayRefit = wgslModule({
    name: 'ray_build_refit',
    source: rayRefitSource,
    requires: [
        WORKGROUP_SIZE.module,
        rayCommon,
        rayPrimBox,
        B.build,
        B.aabbsRead,
        B.bvhOut,
        B.parentsRead,
        B.counters,
        B.boxes,
    ],
});

/** Triângulos na ordem das folhas. */
export const rayReorder = wgslModule({
    name: 'ray_build_reorder',
    source: rayReorderSource,
    requires: [WORKGROUP_SIZE.module, rayCommon, B.build, B.valuesRead, B.geometryOut, B.tris],
});

/** Instâncias da hierarquia de cima. */
export const rayInstances = wgslModule({
    name: 'ray_build_instances',
    source: rayInstancesSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        rayCommon,
        rayReduce,
        B.build,
        B.instanceSources,
        worldsResource,
        renderablesResource,
        standardMaterialsResource,
        B.bvhOut,
        B.aabbs,
    ],
    structs: [RenderableSchema, StandardMaterialSchema],
});
