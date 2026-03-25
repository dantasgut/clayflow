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
import { Loggable }       from './debug/Loggable';
import { Logger }         from './debug/Logger';
import { LogCall }        from './debug/LogCall';

/**
 * Super Fachada (Facade) da Camada 1.
 * Ponto de injeção único para o restante do motor gráfico (Padrão de Inversão de Controle).
 * Protege as instâncias singulares e orquestra a comunicação entre os gerentes na base física.
 */
@Loggable('WebGPUEngineCore')
export class WebGPUEngineCore implements EngineCore {
    declare private readonly log: Logger;
    private contextRef: WebGPUContext;
    private resourcesRef: WebGPUResourceManager;
    private pipelinesRef: WebGPUPipelineManager;
    private renderPassesRef: WebGPURenderPassManager;
    private computeRef: WebGPUComputeManager;
    private bundlesRef: BundleCache;
    private indirectRef: IndirectDrawManager;
    private copyRef: CopyManager;
    private profilerRef: ProfilerSystem;

    private static instance: WebGPUEngineCore;

    private constructor() {
        this.contextRef      = WebGPUContext.getInstance();
        this.resourcesRef    = new WebGPUResourceManager();
        this.pipelinesRef    = new WebGPUPipelineManager();
        this.renderPassesRef = new WebGPURenderPassManager();
        this.computeRef      = new WebGPUComputeManager();
        this.bundlesRef      = new BundleCache();
        this.indirectRef     = new IndirectDrawManager();
        this.copyRef         = new CopyManager();
        // ProfilerSystem precisa do device — inicializado após initialize()
        this.profilerRef     = null!;
    }

    public static getInstance(): WebGPUEngineCore {
        if (!WebGPUEngineCore.instance) {
            WebGPUEngineCore.instance = new WebGPUEngineCore();
        }
        return WebGPUEngineCore.instance;
    }

    @LogCall('info', 'Camada 1 online em {duration}')
    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        // initialize() é idempotente — WebGPUContext.initialize() serializa chamadas concorrentes.
        // ProfilerSystem é criado apenas na primeira chamada (quando profilerRef ainda é null).
        await this.contextRef.initialize(canvas);
        if (!this.profilerRef) {
            this.profilerRef = new ProfilerSystem();
        }
    }

    @LogCall('info', 'Recursos da Camada 1 destruídos em {duration}')
    public destroy(): void {
        this.resourcesRef.destroyAll();
        (WebGPUEngineCore as any).instance = undefined;
    }

    public get canvasFormat(): GPUTextureFormat {
        return this.contextRef.format;
    }

    public getCurrentCanvasTextureView(): GPUTextureView {
        return this.contextRef.context.getCurrentTexture().createView();
    }

    public get resources(): ResourceManager { return this.resourcesRef; }
    public get pipelines(): PipelineManager { return this.pipelinesRef; }
    public get renderPasses(): RenderPassManager { return this.renderPassesRef; }
    public get compute(): ComputeManager { return this.computeRef; }
    public get bundles(): BundleCacheInterface { return this.bundlesRef; }
    public get indirect(): IndirectDrawManagerInterface { return this.indirectRef; }
    public get copy(): CopyManagerInterface { return this.copyRef; }
    public get profiler(): Profiler { return this.profilerRef; }
}
