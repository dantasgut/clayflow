/**
 * Subtipo de buffer GPU. Cada subkind mapeia para um conjunto específico
 * de `GPUBufferUsage` flags:
 *   - `vertex`: VERTEX | STORAGE | COPY_SRC | COPY_DST
 *   - `index`: INDEX | STORAGE | COPY_SRC | COPY_DST
 *   - `uniform`: UNIFORM | COPY_DST
 *   - `storage`: STORAGE | COPY_SRC | COPY_DST
 *   - `indirect`: INDIRECT | STORAGE | COPY_SRC | COPY_DST
 *   - `staging`: COPY_DST | MAP_READ (readback CPU)
 */
export type BufferSubkind = 'vertex' | 'index' | 'uniform' | 'storage' | 'indirect' | 'staging';

/**
 * Base interface para todos os specs de buffer GPU. Subclasses concretas
 * (UniformBufferSpec, StorageBufferSpec, etc.) adicionam `byteSize`,
 * `stride`, `count`, `format` etc. conforme o subkind.
 *
 * `discriminator` é parte do specHash — duas specs com mesmo discriminator
 * + outros campos viram o mesmo GPU buffer no store. Use para idempotência.
 * `label` é metadado para debugging (Chrome DevTools, RenderDoc).
 */
export interface BufferSpec {
    /** Discriminador de tipo — sempre `'buffer'` em buffer specs. */
    readonly kind: 'buffer';
    readonly subkind: BufferSubkind;
    /** Discriminador semântico (e.g. 'rb_pool', 'mpm_grid'). Parte do specHash. */
    readonly discriminator?: string;
    /** Label para debugging (mostra em DevTools / profilers). */
    readonly label?: string;
}
