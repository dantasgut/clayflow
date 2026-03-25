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

        const device = this.context.device;

        device.pushErrorScope('validation');

        const module = device.createShaderModule({ code: wgslCode, label: `ShaderModule_${id}` });

        const pipeline = await device.createComputePipelineAsync({
            label: `ComputePipeline_${id}`,
            layout: 'auto',
            compute: {
                module: module,
                entryPoint: entryPoint
            }
        });

        const gpuError = await device.popErrorScope();
        if (gpuError) {
            throw new Error(`[WGSL compile] ${id}: ${gpuError.message}`);
        }

        this.pipelines.set(id, pipeline);
        return pipeline;
    }

    public getComputePipeline(id: string): GPUComputePipeline | undefined {
        return this.pipelines.get(id);
    }

    public beginComputePassExplicit(
        encoder:         GPUCommandEncoder,
        label?:          string,
        timestampWrites?: GPUComputePassTimestampWrites,
    ): GPUComputePassEncoder {
        return encoder.beginComputePass({
            ...(label           !== undefined && { label }),
            ...(timestampWrites !== undefined && { timestampWrites }),
        });
    }

    public dispatchOnPass(
        pass:            GPUComputePassEncoder,
        pipelineId:      string,
        bindGroups:      GPUBindGroup[],
        workgroupsX:     number,
        workgroupsY:     number = 1,
        workgroupsZ:     number = 1,
    ): void {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) throw new Error(`Pipeline de Compute '${pipelineId}' não encontrado.`);
        pass.setPipeline(pipeline);
        bindGroups.forEach((bg, index) => pass.setBindGroup(index, bg));
        pass.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
    }

    public createBindGroupFromPipeline(
        pipelineId: string,
        groupIndex: number,
        entries:    GPUBindGroupEntry[],
        label?:     string,
    ): GPUBindGroup {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) throw new Error(`Pipeline '${pipelineId}' não encontrado.`);
        return this.context.device.createBindGroup({
            label:   label ?? `BindGroup_${pipelineId}_group${groupIndex}`,
            layout:  pipeline.getBindGroupLayout(groupIndex),
            entries,
        });
    }

    public beginComputePass(encoder: GPUCommandEncoder, label?: string): GPUComputePassEncoder {
        return encoder.beginComputePass(label !== undefined ? { label } : undefined);
    }

    public dispatch(
        encoder: GPUCommandEncoder,
        pipelineId: string,
        bindGroups: GPUBindGroup[],
        workgroupsX: number,
        workgroupsY: number = 1,
        workgroupsZ: number = 1
    ): void {
        const pipeline = this.pipelines.get(pipelineId);
        if (!pipeline) throw new Error(`Pipeline de Compute ${pipelineId} não encontrado.`);

        const passEncoder = encoder.beginComputePass({ label: `ComputePass_${pipelineId}` });

        passEncoder.setPipeline(pipeline);
        bindGroups.forEach((bg, index) => {
            passEncoder.setBindGroup(index, bg);
        });

        passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
        passEncoder.end();
    }
}
