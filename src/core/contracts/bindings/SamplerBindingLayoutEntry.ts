import type { BaseBindingLayoutEntry } from './BaseBindingLayoutEntry';

export interface SamplerBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'sampler';
    readonly type?: 'filtering' | 'non-filtering' | 'comparison';
}
