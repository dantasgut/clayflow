import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import nsAssignCountSource from '../wgsl/kernels/ns_assign_count.wgsl?raw';
import nsScatterSource from '../wgsl/kernels/ns_scatter.wgsl?raw';
import nsFindSource from '../wgsl/kernels/ns_find.wgsl?raw';
import nsSortCellsSource from '../wgsl/kernels/ns_sort_cells.wgsl?raw';
import { NsSimParamsSchema } from '../../gpu/schemas';
import { poolLive } from '../compute/shaders';

// Kernels da busca de vizinhança (hashing espacial + espalhamento + busca; a soma de prefixos é o `PrefixSum`).
// Recursos (spec 031): todos privados do estágio (`NeighborSearchPipeline`), na frequência `stage`.

const u32s: WgslResourceType = { wgsl: 'u32', array: true };
const stage = (
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

/** Recursos da busca de vizinhança. */
export const neighborResources = Object.freeze({
    params: wgslResource({
        name: 'ns_params',
        binding: { uniform: true },
        type: { schema: NsSimParamsSchema },
        frequency: 'stage',
        provider: 'private',
    }),
    particles: stage('particle_data', 'read', { wgsl: 'f32', array: true }),
    cellIds: stage('cell_ids', 'read_write', u32s),
    cellIdsRead: stage('cell_ids', 'read', u32s),
    live: stage('live', 'read', u32s),
    cellCount: stage('cell_count', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    cellCursor: stage('cell_cursor', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    sortedParticles: stage('sorted_particles', 'read_write', u32s),
    sortedParticlesRead: stage('sorted_particles', 'read', u32s),
    cellStart: stage('cell_start', 'read', u32s),
    cellCountRead: stage('cell_count_buf', 'read', u32s),
    sortedPositions: stage('sorted_positions', 'read_write', { wgsl: 'vec4f', array: true }),
    sortedPositionsRead: stage('sorted_positions', 'read', { wgsl: 'vec4f', array: true }),
    neighborList: stage('neighbor_list', 'read_write', u32s),
    neighborCount: stage('neighbor_count', 'read_write', u32s),
    /** A ordem por célula: no posto `t`, a partícula + 1 (0: posto vazio). */
    order: stage('ns_order', 'read_write', u32s),
    orderRead: stage('ns_order', 'read', u32s),
});
const R = neighborResources;

/** Célula de cada partícula e contagem por célula. */
export const nsAssignCount = wgslModule({
    name: 'ns_assign_count',
    source: nsAssignCountSource,
    requires: [
        poolLive,
        NONE.module,
        WORKGROUP_SIZE.module,
        R.params,
        R.particles,
        R.cellIds,
        R.live,
        R.cellCount,
    ],
    structs: [NsSimParamsSchema],
});

/** Espalhamento das partículas nas células ordenadas. */
export const nsScatter = wgslModule({
    name: 'ns_scatter',
    source: nsScatterSource,
    requires: [
        NONE.module,
        WORKGROUP_SIZE.module,
        R.params,
        R.cellIdsRead,
        R.cellCursor,
        R.sortedParticles,
        R.order,
    ],
    structs: [NsSimParamsSchema],
});

/** Ordenação por índice das partículas de cada célula (lista de vizinhos determinística). */
export const nsSortCells = wgslModule({
    name: 'ns_sort_cells',
    source: nsSortCellsSource,
    requires: [
        WORKGROUP_SIZE.module,
        R.params,
        R.cellStart,
        R.cellCountRead,
        R.sortedParticles,
        R.particles,
        R.sortedPositions,
        R.order,
    ],
    structs: [NsSimParamsSchema],
});

/** Busca dos vizinhos (células em ordem fixa, cada uma ordenada por índice). */
export const nsFind = wgslModule({
    name: 'ns_find',
    source: nsFindSource,
    requires: [
        poolLive,
        WORKGROUP_SIZE.module,
        R.params,
        R.particles,
        R.cellStart,
        R.cellCountRead,
        R.sortedParticlesRead,
        R.neighborList,
        R.neighborCount,
        R.live,
        R.sortedPositionsRead,
        R.orderRead,
    ],
    structs: [NsSimParamsSchema],
});
