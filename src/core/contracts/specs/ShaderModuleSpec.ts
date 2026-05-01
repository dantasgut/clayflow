/**
 * Spec de shader module — encapsula um WGSL source (vertex+fragment+compute
 * podem coexistir num mesmo module com entry points distintos).
 * Materializado em GPUShaderModule via `device.createShaderModule({code})`.
 *
 * specHash é baseado em `source + discriminator`, então edits no source
 * geram nova GPU object (Vite HMR funciona out-of-the-box).
 */
export interface ShaderModuleSpec {
    readonly kind: 'shader';
    /** Discriminador semântico (e.g. 'lcp_predict_shader'). Parte do specHash. */
    readonly discriminator?: string;
    /** Label para debugging. */
    readonly label?: string;
    /** WGSL source code completo. */
    readonly source: string;
}
