export type RenderPipelineDescriptor = Omit<GPURenderPipelineDescriptor, 'vertex' | 'fragment'> & {
    vertexEntryPoint: string;
    fragmentEntryPoint: string;
    vertexBuffers?: Iterable<GPUVertexBufferLayout>;
    /** Substitui o array padrão de targets do fragment stage (ex.: blend state). */
    fragmentTargets?: GPUColorTargetState[];
};

export interface PipelineManager {
    createRenderPipeline(id: string, wgslCode: string, descriptor: RenderPipelineDescriptor): Promise<GPURenderPipeline>;
    getRenderPipeline(id: string): GPURenderPipeline | undefined;

    /**
     * Cria (ou retorna do cache) um GPUPipelineLayout.
     * @param id      Chave de cache.
     * @param layouts GPUBindGroupLayout em ordem de @group(n) — obtidos via BindGroupManager.
     */
    createPipelineLayout(id: string, layouts: GPUBindGroupLayout[]): GPUPipelineLayout;
}
