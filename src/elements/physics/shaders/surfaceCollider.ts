import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { linalg, noise } from '../../gpu/shaders/math';
import surfaceColliderBuildSource from '../../gpu/wgsl/kernels/surface_collider_build.wgsl?raw';
import surfaceColliderCommonSource from '../../gpu/wgsl/kernels/surface_collider_common.wgsl?raw';
import surfaceColliderPointsSource from '../../gpu/wgsl/kernels/surface_collider_points.wgsl?raw';
import { surfaceAt, surfaceResources } from '../../geometry/shaders';
import {
    SpaceFnRecordSchema,
    SurfaceFnRecordSchema,
    SurfaceParamsSchema,
} from '../../geometry/SurfaceSchemas';
import { Transform } from '../../scene/Transform';

/**
 * Parâmetros de uma passada da construção de um colisor de superfície (spec 010; uma região por passada, offset
 * dinâmico): amostragem, cópias e os tempos delas, grade e modo, faixa do campo, transformação (da CPU ou do pool de
 * mundo) e, no jump flooding, o passo e a metade lida.
 */
export const SurfaceBakeParamsSchema = new StructSchema(
    'SurfaceBakeParams',
    {
        nu: FieldType.u32,
        nv: FieldType.u32,
        samples: FieldType.u32,
        tris: FieldType.u32,
        copies: FieldType.u32,
        mode: FieldType.u32,
        nx: FieldType.u32,
        ny: FieldType.u32,
        nz: FieldType.u32,
        cells: FieldType.u32,
        band: FieldType.u32,
        field_first: FieldType.u32,
        copy_stride: FieldType.u32,
        transform_slot: FieldType.u32,
        use_world_pool: FieldType.u32,
        pass_step: FieldType.u32,
        parity: FieldType.u32,
        margin: FieldType.f32,
        _pad1: FieldType.u32,
        _pad2: FieldType.u32,
        t0: FieldType.vec4f,
        t1: FieldType.vec4f,
        t2: FieldType.vec4f,
        t3: FieldType.vec4f,
        world: FieldType.mat4x4f,
        normal0: FieldType.vec4f,
        normal1: FieldType.vec4f,
        normal2: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);

const bakeBuffer = (
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
 * Recursos da construção de um colisor de superfície (spec 031): privados do `SurfaceColliderFlow`; o uniforme de cada
 * passada (`bake`, uma região por passada) muda entre despachos (`draw`).
 */
export const surfaceBakeResources = Object.freeze({
    bake: wgslResource({
        name: 'bake',
        binding: { uniform: true },
        type: { schema: SurfaceBakeParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    points: bakeBuffer('bake_points', 'read_write', { wgsl: 'vec4f', array: true }),
    bounds: bakeBuffer('bake_bounds', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    cells: bakeBuffer('bake_cells', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    ids: bakeBuffer('bake_ids', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    field: bakeBuffer('bake_field', 'read_write', { wgsl: 'f32', array: true }),
    worlds: bakeBuffer('bake_worlds', 'read', { schema: Transform.worldSchema, array: true }),
});
const B = surfaceBakeResources;

/** Codificação em ordem total, tempos das cópias, triângulos da amostragem, ponto mais próximo de um triângulo. */
export const surfaceColliderCommon = wgslModule({
    name: 'surface_collider_common',
    source: surfaceColliderCommonSource,
    requires: [NONE.module, B.bake],
    structs: [SurfaceBakeParamsSchema],
});

/** Passada 1 da construção: a superfície amostrada por `surface_at` no tempo de cada cópia, com a caixa. */
export const surfaceColliderPoints = wgslModule({
    name: 'surface_collider_points',
    source: surfaceColliderPointsSource,
    // `noise` e `linalg` ficam à mão das funções do usuário (como no `surface_eval`).
    requires: [
        noise,
        linalg,
        surfaceAt,
        surfaceColliderCommon,
        WORKGROUP_SIZE.module,
        surfaceResources.params,
        surfaceResources.fnRecords,
        surfaceResources.spaceRecords,
        B.points,
        B.bounds,
    ],
    structs: [
        SurfaceBakeParamsSchema,
        SurfaceParamsSchema,
        SurfaceFnRecordSchema,
        SpaceFnRecordSchema,
    ],
});

/** Demais passadas: rascunho, cabeçalho, altura ou distância (semeadura, jump flooding, sinal). */
export const surfaceColliderBuild = wgslModule({
    name: 'surface_collider_build',
    source: surfaceColliderBuildSource,
    requires: [
        linalg,
        surfaceColliderCommon,
        WORKGROUP_SIZE.module,
        B.points,
        B.bounds,
        B.cells,
        B.ids,
        B.field,
        B.worlds,
    ],
    structs: [SurfaceBakeParamsSchema, Transform.worldSchema],
});
