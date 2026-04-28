import type { BaseBindingLayoutEntry } from './BindingLayoutEntry';

export interface SamplerBindingLayoutEntry extends BaseBindingLayoutEntry {
    readonly kind: 'sampler';
    readonly type?: 'filtering' | 'non-filtering' | 'comparison';
}
