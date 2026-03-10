import { WebGPUContext } from '../context/WebGPUContext';
import type { ComputeManager } from '../interfaces/ComputeManager';

/**
 * Gerenciador focado inteiramente em processamento GPGPU e Matemática sem envolver rasterização.
 */
export class WebGPUComputeManager implements ComputeManager {
    private context: WebGPUContext;
    private pipelines: Map<string, GPUComputePipeline>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.pipelines = new Map();
    }

    public async createComputePipeline(id: string, wgslCode: string, entryPoint: string = 'main'): Promise<GPUComputePipeline> {
        if (this.pipelines.has(id)) {
            return this.pipelines.get(id)!;
        }

        const module = this.context.device.createShaderModule({ code: wgslCode, label: `ShaderModule_${id}` });

        const pipeline = await this.context.device.createComputePipelineAsync({
            label: `ComputePipeline_${id}`,
            layout: 'auto',
            compute: {
                module: module,
                entryPoint: entryPoint
            }
        });

        this.pipelines.set(id, pipeline);
        return pipeline;
    }

    public getComputePipeline(id: string): GPUComputePipeline | undefined {
        return this.pipelines.get(id);
    }

    public dispatch(
        pipelineId: string,
        bindGroups: GPUBindGroup[],
        workgroupsX: number,
        workgroupsY: number = 1,
        workgroupsZ: number = 1
    ): void {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) throw new Error(`Pipeline de Compute ${pipelineId} não encontrado.`);

        const commandEncoder = this.context.device.createCommandEncoder({ label: `ComputeCommandEncoder_${pipelineId}` });
        const passEncoder = commandEncoder.beginComputePass({ label: `ComputePass_${pipelineId}` });

        passEncoder.setPipeline(pipeline);
        bindGroups.forEach((bg, index) => {
            passEncoder.setBindGroup(index, bg);
        });

        passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
        passEncoder.end();

        this.context.queue.submit([commandEncoder.finish()]);
    }
}
