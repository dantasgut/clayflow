/**
 * Struct WGSL: MPMGridNode — nó da grade euleriana MPM.
 *
 * Layout: 32 bytes (8 × 4 bytes, alinhamento std430).
 *
 *   offset  0: mass_i32   (atomic<i32>) — massa acumulada em ponto fixo
 *   offset  4: mom_x_i32  (atomic<i32>) — momentum.x em ponto fixo
 *   offset  8: mom_y_i32  (atomic<i32>) — momentum.y em ponto fixo
 *   offset 12: mom_z_i32  (atomic<i32>) — momentum.z em ponto fixo
 *   offset 16: vel        (vec3f)       — velocidade normalizada (escrita em grid_update)
 *   offset 28: _pad       (f32)         — padding para alinhamento
 *   Total: 32 bytes
 *
 * ## Ponto fixo para atomicAdd
 *
 * WGSL suporta `atomicAdd` apenas em `atomic<i32>` e `atomic<u32>` (não f32).
 * Valores float são multiplicados por `fixed_scale` (padrão: 2^20 = 1 048 576)
 * antes de casting para i32:
 *
 *   i32_value = i32(float_value × fixed_scale)
 *   float_value = f32(i32_value) / fixed_scale
 *
 * Isso limita o range a ±2047 com precisão ~1e-6. Ajustar `fixed_scale`
 * se as massas ou momentos excederem esse range.
 *
 * ## Sequência de uso por substep
 *
 *   1. reset_grid: buffer zerado via encoder.clearBuffer() (TypeScript)
 *   2. p2g:        atomicAdd em mass_i32, mom_{x,y,z}_i32
 *   3. grid_update: lê atomics, converte para f32, computa vel, escreve vel
 *   4. g2p:        lê vel (campo f32)
 *
 * ## Nota sobre binding
 *
 * Buffers contendo `atomic<>` devem ser declarados como
 * `var<storage, read_write>` em TODOS os shaders que os referenciam,
 * mesmo naqueles que só leem (g2p lê apenas `vel`, mas o buffer deve
 * ser `read_write` porque contém campos atômicos).
 */
export const WGSL_STRUCT_MPM_GRID_NODE = /* wgsl */`

struct MPMGridNode {
    mass_i32:  atomic<i32>,  // massa × fixed_scale
    mom_x_i32: atomic<i32>,  // momentum.x × fixed_scale
    mom_y_i32: atomic<i32>,  // momentum.y × fixed_scale
    mom_z_i32: atomic<i32>,  // momentum.z × fixed_scale
    vel:       vec3f,        // velocidade normalizada (após grid_update)
    _pad:      f32,          // padding
}
`;
