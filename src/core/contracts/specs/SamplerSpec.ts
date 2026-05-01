/**
 * Spec de sampler GPU — encapsula filtering + wrap modes para sampling
 * de texturas. Materializado em GPUSampler via `device.createSampler(desc)`.
 *
 * Default `desc` (quando omitido) é nearest filtering + clamp-to-edge,
 * adequado para depth maps e UI atlases. Para textures de cor com
 * mipmaps use `{magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear'}`.
 */
export interface SamplerSpec {
    readonly kind: 'sampler';
    /** Discriminador semântico. Parte do specHash. */
    readonly discriminator?: string;
    /** Label para debugging. */
    readonly label?: string;
    /** Descriptor WebGPU (filtering, addressMode, compare, etc.). */
    readonly desc?: GPUSamplerDescriptor;
}
