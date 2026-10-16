import { sharedConstant } from './SharedConstant';

/**
 * Sentinela "nenhum" dos índices `u32` (spec 031, R6): slot de registro ausente, luz ausente, dono ausente. Fonte
 * única para TypeScript e WGSL.
 */
export const NONE = sharedConstant('NONE', 0xffffffff, 'u32');

/** Tamanho de grupo de trabalho dos kernels lineares do motor (`@workgroup_size(WORKGROUP_SIZE)`). */
export const WORKGROUP_SIZE = sharedConstant('WORKGROUP_SIZE', 64, 'u32');
