import { wgslModule } from '../../scene/shaders/WgslModule';
import edgesFromTrianglesSource from '../gpu/wgsl/kernels/edges_from_triangles.wgsl?raw';
import { EdgeParamsSchema } from './edges';

/** Índices de arestas a partir dos índices de triângulo (spec 008, R7): 6 por triângulo, para o desenho em linhas. */
export const edgesFromTriangles = wgslModule({
    name: 'edges_from_triangles',
    source: edgesFromTrianglesSource,
    structs: [EdgeParamsSchema],
});
