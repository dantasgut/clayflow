export type RenderPipelineDescriptor = Omit<GPURenderPipelineDescriptor, 'vertex' | 'fragment'> & {
    vertexEntryPoint: string;
    fragmentEntryPoint: string;
    vertexBuffers?: Iterable<GPUVertexBufferLayout>;
};

export interface PipelineManager {
    createRenderPipeline(id: string, wgslCode: string, descriptor: RenderPipelineDescriptor): Promise<GPURenderPipeline>;
    getRenderPipeline(id: string): GPURenderPipeline | undefined;
}
