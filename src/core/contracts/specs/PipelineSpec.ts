import type { LayoutSpec } from './LayoutSpec';

export type PipelineSubkind = 'compute' | 'render';

export interface PipelineSpec {
    readonly kind: 'pipeline';
    readonly subkind: PipelineSubkind;
    readonly discriminator?: string;
    readonly label?: string;
    readonly layouts: readonly LayoutSpec[];
}
