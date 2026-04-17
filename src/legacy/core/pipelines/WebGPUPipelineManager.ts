import { WebGPUContext } from '../context/WebGPUContext';
import type { PipelineManager, RenderPipelineDescriptor } from '../interfaces/PipelineManager';

/**
 * Gerencia o cache e a compilação paralela dos shaders.
 * Recebe strings brutas de shader e as transforma em pipelines agnósticos.
 */
export class WebGPUPipelineManager implements PipelineManager {
    private context: WebGPUContext;
    private shaderModules: Map<string, GPUShaderModule>;
    private renderPipelines: Map<string, GPURenderPipeline>;
    private pipelineLayouts: Map<string, GPUPipelineLayout>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.shaderModules    = new Map();
        this.renderPipelines  = new Map();
        this.pipelineLayouts  = new Map();
    }

    private getShaderModule(id: string, code: string): GPUShaderModule {
        if (!this.shaderModules.has(id)) {
            const module = this.context.device.createShaderModule({
                label: `ShaderModule_${id}`,
                code: code
            });
            this.shaderModules.set(id, module);
        }
        return this.shaderModules.get(id)!;
    }

    public async createRenderPipeline(
        id: string,
        wgslCode: string,
        pipelineDescriptor: RenderPipelineDescriptor
    ): Promise<GPURenderPipeline> {
        if (this.renderPipelines.has(id)) {
            return this.renderPipelines.get(id)!;
        }

        const shaderModule = this.getShaderModule(id, wgslCode);

        const descriptor: GPURenderPipelineDescriptor = {
            ...pipelineDescriptor,
            layout: pipelineDescriptor.layout || 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: pipelineDescriptor.vertexEntryPoint,
                ...(pipelineDescriptor.vertexBuffers !== undefined ? { buffers: pipelineDescriptor.vertexBuffers } : {})
            },
            fragment: {
                module: shaderModule,
                entryPoint: pipelineDescriptor.fragmentEntryPoint,
                targets: pipelineDescriptor.fragmentTargets ?? [{ format: this.context.format }],
            }
        };

        const pipeline = await this.context.device.createRenderPipelineAsync(descriptor);
        this.renderPipelines.set(id, pipeline);
        return pipeline;
    }

    public getRenderPipeline(id: string): GPURenderPipeline | undefined {
        return this.renderPipelines.get(id);
    }

    public createPipelineLayout(id: string, layouts: GPUBindGroupLayout[]): GPUPipelineLayout {
        if (!this.pipelineLayouts.has(id)) {
            const layout = this.context.device.createPipelineLayout({
                label: `PipelineLayout_${id}`,
                bindGroupLayouts: layouts,
            });
            this.pipelineLayouts.set(id, layout);
        }
        return this.pipelineLayouts.get(id)!;
    }
}
