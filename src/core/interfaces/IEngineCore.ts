import type { IResourceManager } from '../interfaces/IResourceManager';
import type { IPipelineManager } from '../interfaces/IPipelineManager';
import type { IRenderPassManager } from '../interfaces/IRenderPassManager';
import type { IComputeManager } from '../interfaces/IComputeManager';

export interface IEngineCore {
    initialize(canvas: HTMLCanvasElement): Promise<void>;
    readonly canvasFormat: GPUTextureFormat;
    getCurrentCanvasTextureView(): GPUTextureView;
    readonly resources: IResourceManager;
    readonly pipelines: IPipelineManager;
    readonly renderPasses: IRenderPassManager;
    readonly compute: IComputeManager;
}
