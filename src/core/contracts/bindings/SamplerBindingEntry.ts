import type { SamplerSpec } from '../specs/SamplerSpec';

export interface SamplerBindingEntry {
    readonly binding: number;
    readonly kind: 'sampler';
    readonly sampler: SamplerSpec;
}
