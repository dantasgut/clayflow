import type { EngineCore } from './interfaces/EngineCore';
import type { ResourceManager } from './interfaces/ResourceManager';
import type { PipelineManager } from './interfaces/PipelineManager';
import type { RenderPassManager } from './interfaces/RenderPassManager';
import type { ComputeManager } from './interfaces/ComputeManager';
import { WebGPUContext } from './context/WebGPUContext';
import { WebGPUResourceManager } from './resources/WebGPUResourceManager';
import { WebGPUPipelineManager } from './pipelines/WebGPUPipelineManager';
import { WebGPURenderPassManager } from './rendering/WebGPURenderPassManager';
import { WebGPUComputeManager } from './compute/WebGPUComputeManager';

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

    // Para evitar que a GUI crie múltiplas instâncias da Engine
    private static instance: WebGPUEngineCore;

    private constructor() {
        this._context = WebGPUContext.getInstance();
        this._resources = new WebGPUResourceManager();
        this._pipelines = new WebGPUPipelineManager();
        this._renderPasses = new WebGPURenderPassManager();
        this._compute = new WebGPUComputeManager();
    }

    /**
     * Singleton ou Fábrica principal.
     */
    public static getInstance(): WebGPUEngineCore {
        if (!WebGPUEngineCore.instance) {
            WebGPUEngineCore.instance = new WebGPUEngineCore();
        }
        return WebGPUEngineCore.instance;
    }

    /**
     * Prepara a Placa de Vídeo.
     */
    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        await this._context.initialize(canvas);
        console.log("[WebGPUEngineCore] WebGPU Hardware Inicializado. Camada 1 Online.");
    }

    public get canvasFormat(): GPUTextureFormat {
        return this._context.format;
    }

    public getCurrentCanvasTextureView(): GPUTextureView {
        return this._context.context.getCurrentTexture().createView();
    }

    // --- Acesso aos Sub-Sistemas Puros Restritos pelas Interfaces ---

    public get resources(): ResourceManager {
        return this._resources;
    }

    public get pipelines(): PipelineManager {
        return this._pipelines;
    }

    public get renderPasses(): RenderPassManager {
        return this._renderPasses;
    }

    public get compute(): ComputeManager {
        return this._compute;
    }
}
