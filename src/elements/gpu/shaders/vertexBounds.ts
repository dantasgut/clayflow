import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource } from '../../../scene/shaders/WgslResource';
import vertexBoundsSource from '../wgsl/geometry/vertex_bounds.wgsl?raw';

/** Os vértices intercalados da geometria da caixa (8 palavras por vértice), ligados por despacho pelo dono do kernel. */
export const vertexBoundsResource = wgslResource({
    name: 'bounds_vertices',
    binding: { storage: 'read' },
    type: { wgsl: 'f32', array: true },
    frequency: 'draw',
    provider: 'private',
});

/**
 * A caixa dos vértices de uma geometria (spec 034, T060/T060d): a redução de um grupo de 256 invocações, comum ao mapa de
 * sombra virtual e ao descarte do desenho conduzido pela GPU.
 */
export const vertexBounds = wgslModule({
    name: 'vertex_bounds',
    source: vertexBoundsSource,
    requires: [vertexBoundsResource],
});
