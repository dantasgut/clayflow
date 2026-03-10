export interface IPipelineManager {
    createRenderPipeline(id: string, wgslCode: string, pipelineDescriptor: any): Promise<GPURenderPipeline>;
    getRenderPipeline(id: string): GPURenderPipeline | undefined;
}
