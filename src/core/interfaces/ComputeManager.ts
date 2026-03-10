export interface ComputeManager {
    createComputePipeline(id: string, wgslCode: string, entryPoint?: string): Promise<GPUComputePipeline>;
    getComputePipeline(id: string): GPUComputePipeline | undefined;
    dispatch(pipelineId: string, bindGroups: GPUBindGroup[], workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
}
