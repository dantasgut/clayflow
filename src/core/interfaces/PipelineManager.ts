export interface PipelineManager {
    createRenderPipeline(id: string, wgslCode: string, pipelineDescriptor: any): Promise<GPURenderPipeline>;
    getRenderPipeline(id: string): GPURenderPipeline | undefined;
}
