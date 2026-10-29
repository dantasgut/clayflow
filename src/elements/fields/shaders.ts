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
import fieldRayOccupiedSource from '../gpu/wgsl/fields/field_ray_occupied.wgsl?raw';
import fieldDensitySource from '../gpu/wgsl/fields/field_density.wgsl?raw';
import fieldRedistanceSource from '../gpu/wgsl/fields/field_redistance.wgsl?raw';
import fieldApronSource from '../gpu/wgsl/fields/field_apron.wgsl?raw';
import fieldsSource from '../gpu/wgsl/fields/fields.wgsl?raw';
import fieldRayHitSource from '../gpu/wgsl/fields/field_ray_hit.wgsl?raw';
import fieldRayTransmittanceSource from '../gpu/wgsl/fields/field_ray_transmittance.wgsl?raw';
import fieldSurfaceSource from '../gpu/wgsl/fields/field_surface.wgsl?raw';
import fieldBodyClosuresSource from '../gpu/wgsl/fields/field_body_closures.wgsl?raw';
import fieldRaySurfaceSource from '../gpu/wgsl/fields/field_ray_surface.wgsl?raw';
import fieldFilmSource from '../gpu/wgsl/fields/field_film.wgsl?raw';
import fieldFilmUpdateSource from '../gpu/wgsl/fields/field_film_update.wgsl?raw';
import fieldFilmDepositSource from '../gpu/wgsl/fields/field_film_deposit.wgsl?raw';
import fieldFilmStepSource from '../gpu/wgsl/fields/field_film_step.wgsl?raw';
import fieldLightTransmissionSource from '../gpu/wgsl/fields/field_light_transmission.wgsl?raw';
import fieldLightMapSource from '../gpu/wgsl/fields/field_light_map.wgsl?raw';
import fieldLightFrameSource from '../gpu/wgsl/fields/field_light_frame.wgsl?raw';
import fieldMeshSource from '../gpu/wgsl/fields/field_mesh.wgsl?raw';
import { rayVolumeMaterial, rayVolumeTypes } from '../raytrace/points';
import { rayWave } from '../raytrace/wave/shaders';
import { LIGHT_LIMIT, lightIncoming } from '../scene/points/lightContributions';
import { lightsResource } from '../scene/resources';
import { closure } from '../material/pbr/shaders';
import {
    FIELD_FILM_SURFACES,
    FIELD_FILM_WORDS,
    FieldGatherSchema,
    FluidFieldSchema,
} from './schemas';
import { bsdf, colliderSurface, hashAddress, linalg } from '../gpu/shaders/math';

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
    /** O mapa da luz pela água (spec 039 refeita): o que `light_transmission` lê, e a escrita dele. */
    lightMap: consumer('field_light_map', 'lightMap', 'read', f32s),
    lightMapOut: consumer('field_light_map_out', 'lightMap', 'read_write', f32s),
    /** A malha da superfície (spec 039 refeita): a escrita, os argumentos e a leitura de quem a desenha. */
    meshOut: consumer('field_mesh', 'mesh', 'read_write', u32s),
    meshArgs: consumer('field_mesh_args', 'meshArgs', 'read_write', {
        wgsl: 'atomic<u32>',
        array: true,
    }),
    mesh: consumer('field_mesh_vertices', 'mesh', 'read', u32s),
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
    /** O sólido mais próximo de cada partícula (normal, distância; normal zero sem), na junção e na ordem da grade. */
    contacts: priv('field_contacts', 'read', vec4fs),
    contactsWrite: priv('field_contacts', 'read_write', vec4fs),
    sortedContacts: priv('field_sorted_contacts', 'read', vec4fs),
    sortedContactsWrite: priv('field_sorted_contacts', 'read_write', vec4fs),
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
        NONE.module,
        R.params,
        R.gather,
        R.particles,
        R.live,
        poolLive,
        R.itemsWrite,
        R.contactsWrite,
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
        R.contacts,
        R.sortedContactsWrite,
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
        R.sortedContacts,
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

/** A película de água nos sólidos (spec 034): a tabela, as chaves, as células e a tabela das superfícies. */
const fieldFilm = wgslModule({
    name: 'field_film',
    source: fieldFilmSource,
    requires: [
        R.params,
        fieldCommon,
        hashAddress,
        FIELD_FILM_WORDS.module,
        FIELD_FILM_SURFACES.module,
    ],
});

/** A tabela da película escrita com atômicos: a busca e a inserção de uma célula. */
const fieldFilmUpdate = wgslModule({
    name: 'field_film_update',
    source: fieldFilmUpdateSource,
    requires: [NONE.module, R.params, fieldCommon, fieldFilm, R.dataAtomic],
});

/** Deposição da película por partícula encostada num sólido. */
export const fieldFilmDeposit = wgslModule({
    name: 'field_film_deposit',
    source: fieldFilmDepositSource,
    requires: [
        WORKGROUP_SIZE.module,
        R.params,
        fieldCommon,
        fieldFilm,
        fieldFilmUpdate,
        R.sorted,
        R.sortedContacts,
        R.kernel,
    ],
});

/**
 * Um passo da película por célula: a superfície física dela, a absorção, a evaporação e o escoamento sobre a superfície
 * dos sólidos (o conjunto de colliders).
 */
export const fieldFilmStep = wgslModule({
    name: 'field_film_step',
    source: fieldFilmStepSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        fieldFilm,
        fieldFilmUpdate,
        colliderSurface,
    ],
});

/** Consulta ao campo: φ, normal, a marcha de um raio e a película nos sólidos. */
export const fields = wgslModule({
    name: 'fields',
    source: fieldsSource,
    requires: [NONE.module, R.params, fieldCommon, fieldLookup, fieldFilm],
});

/** Contribuição do campo ao ponto `scene_wetness`: a película livre e a saturação dos poros no ponto do sólido. */
export const fieldWetness = wgslModule({
    name: 'field_wetness',
    source: 'fn scene_wetness(p: vec3f, n: vec3f) -> vec2f {\n    return field_film_at(p, n);\n}',
    requires: [fields],
});

/** Contribuição do campo ao ponto `ray_volume_hit`: o cruzamento com a superfície da água. */
export const fieldRayHit = wgslModule({
    name: 'field_ray_hit',
    source: fieldRayHitSource,
    requires: [rayVolumeTypes, fields],
});

/** O material da água num acerto do campo: a função `material` do corpo (o grafo). */
const fieldSurface = wgslModule({
    name: 'field_surface',
    source: fieldSurfaceSource,
    requires: [rayVolumeTypes, fields, closure, R.data],
});

/**
 * O material de cada corpo na onda dos acertos (spec 039): o acerto sintético no centro da caixa do campo por corpo e,
 * depois do material avaliado por classe, o meio dele (a absorção, o índice, o Abbe) no buffer das consultas.
 */
export const fieldBodyClosures = wgslModule({
    name: 'field_body_material',
    source: fieldBodyClosuresSource,
    requires: [WORKGROUP_SIZE.module, fields, closure, rayVolumeMaterial, rayWave, R.dataVoxels],
});

/** Contribuição do campo ao ponto `ray_volume_surface`: o material da água no acerto. */
export const fieldRaySurface = wgslModule({
    name: 'field_ray_surface',
    source: fieldRaySurfaceSource,
    requires: [rayVolumeTypes, fieldSurface],
});

/** Contribuição do campo ao ponto `ray_volume_transmittance`: a absorção pelos trechos dentro da água. */
export const fieldRayTransmittance = wgslModule({
    name: 'field_ray_transmittance',
    source: fieldRayTransmittanceSource,
    requires: [fields, rayVolumeTypes, rayVolumeMaterial, fieldSurface],
});

/** Contribuição do campo ao ponto `ray_volume_begin`: o orçamento de passos da marcha renovado a cada raio. */
export const fieldRayBegin = wgslModule({
    name: 'field_ray_begin',
    source: 'fn ray_volume_begin() {\n    field_steps_left = FIELD_STEP_BUDGET;\n}',
    requires: [fields],
});

/** Contribuição do campo ao ponto `ray_volume_bounds`: a caixa dele (spec 034, T067c: um alvo dos fótons). */
export const fieldRayBounds = wgslModule({
    name: 'field_ray_bounds',
    source: 'fn ray_volume_bounds() -> array<vec3f, 2> {\n    return field_box();\n}',
    requires: [fields],
});

/**
 * Contribuição do campo ao ponto `ray_volume_occupied`: o raio passa por algum bloco do campo (spec 034, T067c: a
 * emissão dos fótons só onde há água).
 */
export const fieldRayOccupied = wgslModule({
    name: 'field_ray_occupied',
    source: fieldRayOccupiedSource,
    requires: [fields],
});

/**
 * A malha da superfície da água (spec 039 refeita, D3): tetraedros marchantes por bloco ocupado, os triângulos com a
 * normal pelo gradiente, a contagem e os argumentos do desenho indireto.
 */
export const fieldMesh = wgslModule({
    name: 'field_mesh_extract',
    source: fieldMeshSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        fieldCommon,
        R.counts,
        fieldLookup,
        R.meshOut,
        R.meshArgs,
    ],
});

/** O referencial de cada luz direcional sobre a caixa do campo e o mapa de cada luz (spec 039 refeita). */
const fieldLightFrame = wgslModule({
    name: 'field_light_frame',
    source: fieldLightFrameSource,
    requires: [NONE.module, LIGHT_LIMIT.module, fields, lightsResource],
});

/**
 * O mapa da luz pela água (spec 039 refeita): por luz direcional, um texel por raio paralelo a ela sobre a caixa do
 * campo, com as duas primeiras camadas de água, o Fresnel da entrada e os corpos — uma marcha por texel por quadro.
 */
export const fieldLightMap = wgslModule({
    name: 'field_light_map_write',
    source: fieldLightMapSource,
    requires: [WORKGROUP_SIZE.module, fields, fieldLightFrame, fieldSurface, bsdf, R.lightMapOut],
});

/**
 * Contribuição do campo ao ponto `light_transmission`: a luz das fontes que atravessa a superfície da água até o ponto
 * em linha reta, com o Fresnel e Beer–Lambert, numa marcha só (spec 034, T067c; as cáusticas corrigem para o caminho
 * refratado).
 */
export const fieldLightTransmission = wgslModule({
    name: 'field_light_transmission',
    source: fieldLightTransmissionSource,
    requires: [
        fields,
        rayVolumeTypes,
        rayVolumeMaterial,
        fieldSurface,
        fieldLightFrame,
        bsdf,
        lightIncoming,
        lightsResource,
        R.lightMap,
    ],
});
