import { wgslModule } from '../../scene/shaders/WgslModule';
import {
    wgslResource,
    type WgslResource,
    type WgslResourceType,
} from '../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { SetCountSchema } from '../../scene/graph/SetCountSchema';
import { HashGridParamsSchema } from '../gpu/compute/schemas';
import { poolLive, spatialHash } from '../gpu/compute/shaders';
import fieldCommonSource from '../gpu/wgsl/fields/field_common.wgsl?raw';
import fieldLookupSource from '../gpu/wgsl/fields/field_lookup.wgsl?raw';
import fieldGatherSource from '../gpu/wgsl/fields/field_gather.wgsl?raw';
import fieldSortSource from '../gpu/wgsl/fields/field_sort.wgsl?raw';
import fieldKernelsSource from '../gpu/wgsl/fields/field_kernels.wgsl?raw';
import fieldMarkSource from '../gpu/wgsl/fields/field_mark.wgsl?raw';
import fieldLinksSource from '../gpu/wgsl/fields/field_links.wgsl?raw';
import fieldDensitySource from '../gpu/wgsl/fields/field_density.wgsl?raw';
import fieldRedistanceSource from '../gpu/wgsl/fields/field_redistance.wgsl?raw';
import fieldApronSource from '../gpu/wgsl/fields/field_apron.wgsl?raw';
import fieldsSource from '../gpu/wgsl/fields/fields.wgsl?raw';
import fieldRayHitSource from '../gpu/wgsl/fields/field_ray_hit.wgsl?raw';
import fieldRayTransmittanceSource from '../gpu/wgsl/fields/field_ray_transmittance.wgsl?raw';
import fieldClosureSource from '../gpu/wgsl/fields/field_closure.wgsl?raw';
import fieldRayClosureSource from '../gpu/wgsl/fields/field_ray_closure.wgsl?raw';
import { FluidSurfaceMaterialSchema } from '../material/FluidSurfaceMaterialSchema';
import { rayVolumeTypes } from '../raytrace/points';
import { rayHitMaterialReady } from '../raytrace/shaders';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import { FieldGatherSchema, FluidFieldSchema } from './schemas';
import { hashAddress, linalg } from '../gpu/shaders/math';

// Módulos do campo dos fluidos (spec 033, R11): a construção por quadro (junção das partículas, núcleos anisotrópicos,
// marcação dos blocos, vizinhança, densidade, redistanciamento, borda) e a consulta (φ, normal, marcha). Os buffers que
// quem consulta lê são do Resource `FluidField` (resolvers `FluidField.*`); os de trabalho, do `FluidFieldFlow`.

const u32s: WgslResourceType = { wgsl: 'u32', array: true };
const f32s: WgslResourceType = { wgsl: 'f32', array: true };
const vec4fs: WgslResourceType = { wgsl: 'vec4f', array: true };

const consumer = (
    name: string,
    id: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
): WgslResource =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'frame',
        provider: { consumer: `FluidField.${id}` },
    });

const priv = (name: string, access: 'read' | 'read_write', type: WgslResourceType): WgslResource =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

/** Recursos do campo. */
export const fieldResources = Object.freeze({
    params: wgslResource({
        name: 'fluid_field',
        binding: { uniform: true },
        type: { schema: FluidFieldSchema },
        frequency: 'frame',
        provider: { consumer: 'FluidField.params' },
    }),
    /** O que as consultas leem (limites, tabela, blocos, voxels): uma ligação só. */
    data: consumer('field_data', 'data', 'read', u32s),
    /** O mesmo buffer na limpeza e na marcação (atômicos). */
    dataAtomic: consumer('field_data_atomic', 'data', 'read_write', {
        wgsl: 'atomic<u32>',
        array: true,
    }),
    /** O mesmo buffer na escrita dos voxels com a borda. */
    dataVoxels: consumer('field_data_voxels', 'data', 'read_write', f32s),
    counts: consumer('field_counts', 'counts', 'read', { schema: SetCountSchema, array: true }),
    countsWrite: consumer('field_counts', 'counts', 'read_write', {
        wgsl: 'atomic<u32>',
        array: true,
    }),
    gather: wgslResource({
        name: 'field_gather',
        binding: { uniform: true },
        type: { schema: FieldGatherSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    particles: priv('field_particles', 'read', vec4fs),
    live: priv('field_live', 'read', u32s),
    items: priv('field_items', 'read', vec4fs),
    itemsWrite: priv('field_items', 'read_write', vec4fs),
    /** As partículas na ordem das células da grade (cópia depois dela). */
    sorted: priv('field_sorted', 'read', vec4fs),
    sortedWrite: priv('field_sorted', 'read_write', vec4fs),
    kernel: priv('field_kernel', 'read', vec4fs),
    kernelWrite: priv('field_kernel', 'read_write', vec4fs),
    links: priv('field_links', 'read', u32s),
    linksWrite: priv('field_links', 'read_write', u32s),
    density: priv('field_density', 'read', u32s),
    densityWrite: priv('field_density', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    phi0: priv('field_phi0', 'read_write', f32s),
    /** Interface (a distância fixa) ou o sinal dos outros voxels (±1e30), para as iterações da eikonal. */
    flags: priv('field_flags', 'read_write', f32s),
    src: priv('field_src', 'read', f32s),
    dst: priv('field_dst', 'read_write', f32s),
    grid: wgslResource({
        name: 'grid',
        binding: { uniform: true },
        type: { schema: HashGridParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    /** Volume do campo somado no quadro (ponto fixo; lido na limpeza do seguinte). */
    volumeWrite: priv('field_volume', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    cellStart: priv('cell_start', 'read', u32s),
    cellCount: priv('cell_count', 'read', u32s),
    cellItems: priv('cell_items', 'read', u32s),
    /** Materiais de água (pool `FluidSurfaceMaterial`): o fechamento dos corpos sem função `material`. */
    materials: wgslResource({
        name: 'field_materials',
        binding: { storage: 'read' },
        type: { schema: FluidSurfaceMaterialSchema, array: true },
        frequency: 'frame',
        provider: { pool: FluidSurfaceMaterialSchema.name },
    }),
});

const R = fieldResources;

/** Constantes, chave e balde dos blocos, índices dos voxels. */
export const fieldCommon = wgslModule({
    name: 'field_common',
    source: fieldCommonSource,
    requires: [R.params, hashAddress],
});

/** Leitura do buffer das consultas: a busca de um bloco, o bloco, um voxel, os limites. */
export const fieldLookup = wgslModule({
    name: 'field_lookup',
    source: fieldLookupSource,
    requires: [NONE.module, R.params, fieldCommon, R.data],
});

/** Junção das partículas dos corpos de água no array compacto. */
export const fieldGather = wgslModule({
    name: 'field_gather_kernel',
    source: fieldGatherSource,
    requires: [
        WORKGROUP_SIZE.module,
        R.params,
        R.gather,
        R.particles,
        R.live,
        poolLive,
        R.itemsWrite,
    ],
});

/** As partículas na ordem das células (as mortas, além das vivas da grade, ficam mortas). */
export const fieldSort = wgslModule({
    name: 'field_sort',
    source: fieldSortSource,
    requires: [
        WORKGROUP_SIZE.module,
        R.params,
        R.grid,
        R.cellStart,
        R.cellCount,
        R.cellItems,
        R.items,
        R.sortedWrite,
    ],
});

/** Núcleos anisotrópicos das partículas. */
export const fieldKernels = wgslModule({
    name: 'field_kernels',
    source: fieldKernelsSource,
    requires: [
        WORKGROUP_SIZE.module,
        R.params,
        spatialHash,
        R.grid,
        R.cellStart,
        R.cellCount,
        R.sorted,
        R.kernelWrite,
    ],
});

/** Limpeza da tabela, marcação dos blocos e limites do campo (em voxels). */
export const fieldMark = wgslModule({
    name: 'field_mark',
    source: fieldMarkSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        R.sorted,
        R.kernel,
        R.dataAtomic,
        R.countsWrite,
        R.volumeWrite,
    ],
});

/** Vizinhança dos blocos. */
export const fieldLinks = wgslModule({
    name: 'field_links_kernel',
    source: fieldLinksSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        fieldLookup,
        R.counts,
        R.linksWrite,
    ],
});

/** Densidade nos voxels, por espalhamento dos núcleos (ponto fixo). */
export const fieldDensity = wgslModule({
    name: 'field_density_kernel',
    source: fieldDensitySource,
    requires: [
        linalg,
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        fieldLookup,
        R.sorted,
        R.kernel,
        R.densityWrite,
    ],
});

/** Filtro da densidade, φ inicial, interface e as iterações da eikonal. */
export const fieldRedistance = wgslModule({
    name: 'field_redistance',
    source: fieldRedistanceSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        fieldLookup,
        R.counts,
        R.links,
        R.density,
        R.phi0,
        R.flags,
        R.src,
        R.dst,
    ],
});

/** Voxels finais com a borda. */
export const fieldApron = wgslModule({
    name: 'field_apron',
    source: fieldApronSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        R.counts,
        R.links,
        R.src,
        R.dataVoxels,
        R.volumeWrite,
    ],
});

/** Consulta ao campo: φ, normal e a marcha de um raio. */
export const fields = wgslModule({
    name: 'fields',
    source: fieldsSource,
    requires: [NONE.module, R.params, fieldCommon, fieldLookup],
});

/** Contribuição do campo ao ponto `ray_volume_hit`: o cruzamento com a superfície da água. */
export const fieldRayHit = wgslModule({
    name: 'field_ray_hit',
    source: fieldRayHitSource,
    requires: [rayVolumeTypes, fields],
});

/**
 * O fechamento da água num acerto do campo: a função `material` do corpo pela composição dos acertos dos raios (o
 * `ray_hit_material` pronto, trocado pela composição de quem traça com `bindPoints`), ou o `FluidSurfaceMaterial`.
 */
export const fieldClosure = wgslModule({
    name: 'field_closure',
    source: fieldClosureSource,
    requires: [
        rayVolumeTypes,
        fields,
        R.materials,
        materialPointTypes,
        closure,
        rayHitMaterialReady,
    ],
    structs: [StandardMaterialSchema],
});

/** Contribuição do campo ao ponto `ray_volume_closure`: o fechamento da água no acerto. */
export const fieldRayClosure = wgslModule({
    name: 'field_ray_closure',
    source: fieldRayClosureSource,
    requires: [rayVolumeTypes, fieldClosure],
});

/** Contribuição do campo ao ponto `ray_volume_transmittance`: a absorção pelos trechos dentro da água. */
export const fieldRayTransmittance = wgslModule({
    name: 'field_ray_transmittance',
    source: fieldRayTransmittanceSource,
    requires: [fields, rayVolumeTypes, fieldClosure],
});
