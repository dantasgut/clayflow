export interface SamplerSpec {
    readonly kind: 'sampler';
    readonly discriminator?: string;
    readonly label?: string;
    readonly desc?: GPUSamplerDescriptor;
}
