import type { EngineCore } from './interfaces/EngineCore';
import type { ResourceManager } from './interfaces/ResourceManager';
import type { PipelineManager } from './interfaces/PipelineManager';
import type { RenderPassManager } from './interfaces/RenderPassManager';
import type { ComputeManager } from './interfaces/ComputeManager';
import type { BundleCache as BundleCacheInterface } from './interfaces/BundleCache';
import type { IndirectDrawManager as IndirectDrawManagerInterface } from './interfaces/IndirectDrawManager';
import type { CopyManager as CopyManagerInterface } from './interfaces/CopyManager';
import type { Profiler } from './interfaces/Profiler';
import { WebGPUContext } from './context/WebGPUContext';
import { WebGPUResourceManager } from './resources/WebGPUResourceManager';
import { WebGPUPipelineManager } from './pipelines/WebGPUPipelineManager';
import { WebGPURenderPassManager } from './rendering/WebGPURenderPassManager';
import { WebGPUComputeManager } from './compute/WebGPUComputeManager';
import { BundleCache } from './rendering/BundleCache';
import { IndirectDrawManager } from './rendering/IndirectDrawManager';
import { CopyManager } from './resources/CopyManager';
import { ProfilerSystem } from './utils/ProfilerSystem';

/**
 * Super Fachada (Facade) da Camada 1.
 * Ponto de injeção único para o restante do motor gráfico (Padrão de Inversão de Controle).
 * Protege as instâncias singulares e orquestra a comunicação entre os gerentes na base física.
 */
export class WebGPUEngineCore implements EngineCore {
    private _context: WebGPUContext;
    private _resources: WebGPUResourceManager;
    private _pipelines: WebGPUPipelineManager;
    private _renderPasses: WebGPURenderPassManager;
    private _compute: WebGPUComputeManager;
    private _bundles: BundleCache;
    private _indirect: IndirectDrawManager;
    private _copy: CopyManager;
    private _profiler: ProfilerSystem;

    private static instance: WebGPUEngineCore;

    private constructor() {
        this._context = WebGPUContext.getInstance();
        this._resources = new WebGPUResourceManager();
        this._pipelines = new WebGPUPipelineManager();
        this._renderPasses = new WebGPURenderPassManager();
        this._compute = new WebGPUComputeManager();
        this._bundles = new BundleCache();
        this._indirect = new IndirectDrawManager();
        this._copy = new CopyManager();
        this._profiler = new ProfilerSystem();
    }

    public static getInstance(): WebGPUEngineCore {
        if (!WebGPUEngineCore.instance) {
            WebGPUEngineCore.instance = new WebGPUEngineCore();
        }
        return WebGPUEngineCore.instance;
    }

    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        await this._context.initialize(canvas);
        console.log("[WebGPUEngineCore] WebGPU Hardware Inicializado. Camada 1 Online.");
    }

    public destroy(): void {
        this._resources.destroyAll();
        (WebGPUEngineCore as any).instance = undefined;
    }

    public get canvasFormat(): GPUTextureFormat {
        return this._context.format;
    }

    public getCurrentCanvasTextureView(): GPUTextureView {
        return this._context.context.getCurrentTexture().createView();
    }

    public get resources(): ResourceManager { return this._resources; }
    public get pipelines(): PipelineManager { return this._pipelines; }
    public get renderPasses(): RenderPassManager { return this._renderPasses; }
    public get compute(): ComputeManager { return this._compute; }
    public get bundles(): BundleCacheInterface { return this._bundles; }
    public get indirect(): IndirectDrawManagerInterface { return this._indirect; }
    public get copy(): CopyManagerInterface { return this._copy; }
    public get profiler(): Profiler { return this._profiler; }
}
