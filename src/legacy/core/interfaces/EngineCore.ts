import type { ResourceManager } from '../interfaces/ResourceManager';
import type { PipelineManager } from '../interfaces/PipelineManager';
import type { RenderPassManager } from '../interfaces/RenderPassManager';
import type { ComputeManager } from '../interfaces/ComputeManager';
import type { BundleCache } from '../interfaces/BundleCache';
import type { IndirectDrawManager } from '../interfaces/IndirectDrawManager';
import type { CopyManager } from '../interfaces/CopyManager';
import type { Profiler } from '../interfaces/Profiler';

export interface EngineCore {
    initialize(canvas: HTMLCanvasElement): Promise<void>;
    destroy(): void;
    readonly canvasFormat: GPUTextureFormat;
    getCurrentCanvasTextureView(): GPUTextureView;
    readonly resources: ResourceManager;
    readonly pipelines: PipelineManager;
    readonly renderPasses: RenderPassManager;
    readonly compute: ComputeManager;
    readonly bundles: BundleCache;
    readonly indirect: IndirectDrawManager;
    readonly copy: CopyManager;
    readonly profiler: Profiler;
}
