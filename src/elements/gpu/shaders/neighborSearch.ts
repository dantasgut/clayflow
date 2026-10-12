import { wgslModule } from '../../../scene/shaders/WgslModule';
import { nsScanLevelStructs, nsSimParamsStructs } from './structs';
import nsAssignCountSource from '../wgsl/kernels/ns_assign_count.wgsl?raw';
import nsScanLocalSource from '../wgsl/kernels/ns_scan_local.wgsl?raw';
import nsScanGroupsSource from '../wgsl/kernels/ns_scan_groups.wgsl?raw';
import nsScanCombineSource from '../wgsl/kernels/ns_scan_combine.wgsl?raw';
import nsScatterSource from '../wgsl/kernels/ns_scatter.wgsl?raw';
import nsFindSource from '../wgsl/kernels/ns_find.wgsl?raw';

// Kernels da busca de vizinhança (hashing espacial + soma de prefixos + espalhamento + busca).

/** Célula de cada partícula e contagem por célula. */
export const nsAssignCount = wgslModule({
    name: 'ns_assign_count',
    source: nsAssignCountSource,
    requires: [nsSimParamsStructs],
});

/** Soma de prefixos por grupo de 256 (subida de um nível). */
export const nsScanLocal = wgslModule({
    name: 'ns_scan_local',
    source: nsScanLocalSource,
    requires: [nsScanLevelStructs],
});

/** Soma de prefixos do nível de topo, num grupo. */
export const nsScanGroups = wgslModule({
    name: 'ns_scan_groups',
    source: nsScanGroupsSource,
    requires: [nsScanLevelStructs],
});

/** Descida de um nível: soma o prefixo do grupo. */
export const nsScanCombine = wgslModule({
    name: 'ns_scan_combine',
    source: nsScanCombineSource,
    requires: [nsScanLevelStructs],
});

/** Espalhamento das partículas nas células ordenadas. */
export const nsScatter = wgslModule({
    name: 'ns_scatter',
    source: nsScatterSource,
    requires: [nsSimParamsStructs],
});

/** Busca dos vizinhos (lista ordenada por índice). */
export const nsFind = wgslModule({
    name: 'ns_find',
    source: nsFindSource,
    requires: [nsSimParamsStructs],
});
