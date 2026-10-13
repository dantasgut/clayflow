import { wgslModule } from '../../../scene/shaders/WgslModule';
import nsAssignCountSource from '../wgsl/kernels/ns_assign_count.wgsl?raw';
import nsScatterSource from '../wgsl/kernels/ns_scatter.wgsl?raw';
import nsFindSource from '../wgsl/kernels/ns_find.wgsl?raw';
import { NsSimParamsSchema } from '../../gpu/schemas';
import { poolLive } from '../compute/shaders';

// Kernels da busca de vizinhança (hashing espacial + espalhamento + busca; a soma de prefixos é o `PrefixSum`).

/** Célula de cada partícula e contagem por célula. */
export const nsAssignCount = wgslModule({
    name: 'ns_assign_count',
    source: nsAssignCountSource,
    requires: [poolLive],
    structs: [NsSimParamsSchema],
});

/** Espalhamento das partículas nas células ordenadas. */
export const nsScatter = wgslModule({
    name: 'ns_scatter',
    source: nsScatterSource,
    structs: [NsSimParamsSchema],
});

/** Busca dos vizinhos (lista ordenada por índice). */
export const nsFind = wgslModule({
    name: 'ns_find',
    source: nsFindSource,
    requires: [poolLive],
    structs: [NsSimParamsSchema],
});
