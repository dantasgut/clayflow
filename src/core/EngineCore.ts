import type { IEngineCore } from './interfaces/IEngineCore';
import type { IResourceManager } from './interfaces/IResourceManager';
import type { IPipelineManager } from './interfaces/IPipelineManager';
import type { IRenderPassManager } from './interfaces/IRenderPassManager';
import type { IComputeManager } from './interfaces/IComputeManager';
import { WebGPUContext } from './context/WebGPUContext';
import { ResourceManager } from './resources/ResourceManager';
import { PipelineManager } from './pipelines/PipelineManager';
import { RenderPassManager } from './rendering/RenderPassManager';
import { ComputeManager } from './compute/ComputeManager';

/**
 * Super Fachada (Facade) da Camada 1.
 * Ponto de injeção único para o restante do motor gráfico (Padrão de Inversão de Controle).
 * Protege as instâncias singulares e orquestra a comunicação entre os gerentes na base física.
 */
export class EngineCore implements IEngineCore {
    private _context: WebGPUContext;
    private _resources: ResourceManager;
    private _pipelines: PipelineManager;
    private _renderPasses: RenderPassManager;
    private _compute: ComputeManager;

    // Para evitar que a GUI crie múltiplas instâncias da Engine
    private static instance: EngineCore;

    private constructor() {
        this._context = WebGPUContext.getInstance();
        this._resources = new ResourceManager();
        this._pipelines = new PipelineManager();
        this._renderPasses = new RenderPassManager();
        this._compute = new ComputeManager();
    }

    /**
     * Singleton ou Fábrica principal.
     */
    public static getInstance(): EngineCore {
        if (!EngineCore.instance) {
            EngineCore.instance = new EngineCore();
        }
        return EngineCore.instance;
    }

    /**
     * Prepara a Placa de Vídeo.
     */
    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        await this._context.initialize(canvas);
        console.log("[EngineCore] WebGPU Hardware Inicializado. Camada 1 Online.");
    }

    public get canvasFormat(): GPUTextureFormat {
        return this._context.format;
    }

    public getCurrentCanvasTextureView(): GPUTextureView {
        return this._context.context.getCurrentTexture().createView();
    }

    // --- Acesso aos Sub-Sistemas Puros Restritos pelas Interfaces ---

    public get resources(): IResourceManager {
        return this._resources;
    }

    public get pipelines(): IPipelineManager {
        return this._pipelines;
    }

    public get renderPasses(): IRenderPassManager {
        return this._renderPasses;
    }

    public get compute(): IComputeManager {
        return this._compute;
    }
}
