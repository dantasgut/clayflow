/**
 * EulerianGridLayout — contratos de buffer da grade euleriana compartilhada.
 *
 * ## Buffers
 *
 *   gpu_eulerian_grid_momentum — MPMGridNode[] com atomic<i32> — compartilhado por MPM e FLIP P2G
 *   gpu_eulerian_grid_pressure — f32[] — exclusivo FLIP (pressure projection Jacobi)
 *
 * ## Resolução do Conflito C4
 *
 *   MPM usa atomic<i32> para acumular massa/momento no P2G.
 *   FLIP usa o mesmo mecanismo no P2G, mas precisa de f32 para o pressure solve de Poisson.
 *   Solução: dois buffers no mesmo serviço EulerianGrid — momentum (atomic) + pressure (f32).
 *
 * ## MPMGridNode (reusa a definição do MPM)
 *
 *   Stride: 32 bytes (4×atomic<i32> + vec3f + f32)
 *   Importado de MPMBufferLayout para evitar duplicação.
 */

import { MPM_GRID_NODE_STRIDE_BYTES } from '../mpm/MPMBufferLayout';

// Re-exporta para conveniência dos consumidores
export { MPM_GRID_NODE_STRIDE_BYTES as GRID_NODE_STRIDE_BYTES };

/** Bytes por célula no buffer de pressão (f32). */
export const GRID_PRESSURE_STRIDE_BYTES = 4;

/** ID do buffer de momentum euleriano (quando gerenciado pelo EulerianGrid, não pelo MPMComputePass). */
export const EULERIAN_GRID_MOMENTUM_ID = 'gpu_eulerian_grid_momentum';

/** ID do buffer de pressão euleriano (exclusivo FLIP). */
export const EULERIAN_GRID_PRESSURE_ID = 'gpu_eulerian_grid_pressure';

export interface EulerianGridConfig {
    /** Dimensões da grade [x, y, z] em células. */
    dims:     [number, number, number];
    /** Tamanho de cada célula (metros). */
    cellSize: number;
    /** Canto mínimo da grade em world space [x, y, z]. */
    origin:   [number, number, number];
}
