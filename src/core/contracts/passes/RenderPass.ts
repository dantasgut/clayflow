import type { RenderPipelineSpec } from '../specs/RenderPipelineSpec';
import type { Binder } from './Binder';
import type { BundleRunner } from './BundleRunner';
import type { Drawer } from './Drawer';
import type { GeometryBinder } from './GeometryBinder';
import type { RenderState } from './RenderState';

export interface RenderPass {
    readonly bind: Binder<RenderPipelineSpec>;
    readonly geometry: GeometryBinder;
    readonly state: RenderState;
    readonly draw: Drawer;
    readonly bundles: BundleRunner;
    marker(label: string): void;
}
