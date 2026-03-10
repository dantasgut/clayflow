import type { ResourceManager } from '../interfaces/ResourceManager';
import type { PipelineManager } from '../interfaces/PipelineManager';
import type { RenderPassManager } from '../interfaces/RenderPassManager';
import type { ComputeManager } from '../interfaces/ComputeManager';

export interface EngineCore {
    initialize(canvas: HTMLCanvasElement): Promise<void>;
    readonly canvasFormat: GPUTextureFormat;
    getCurrentCanvasTextureView(): GPUTextureView;
    readonly resources: ResourceManager;
    readonly pipelines: PipelineManager;
    readonly renderPasses: RenderPassManager;
    readonly compute: ComputeManager;
}
