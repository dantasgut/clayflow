export interface ComputeManager {
    createComputePipeline(id: string, wgslCode: string, entryPoint?: string): Promise<GPUComputePipeline>;
    getComputePipeline(id: string): GPUComputePipeline | undefined;

    /**
     * Abre um compute pass no encoder fornecido e retorna o encoder do pass.
     * O chamador é responsável por chamar pass.end() após todos os dispatches.
     * Use quando múltiplos dispatches devem ocorrer no mesmo pass
     * (ex: N substeps × M kernels em um único GPUCommandEncoder por frame).
     */
    beginComputePassExplicit(encoder: GPUCommandEncoder, label?: string, timestampWrites?: GPUComputePassTimestampWrites): GPUComputePassEncoder;

    /**
     * Despacha um compute pipeline em um pass já aberto.
     * Não abre nem fecha o pass — apenas configura pipeline, bind groups e dispatcha.
     */
    dispatchOnPass(
        pass:            GPUComputePassEncoder,
        pipelineId:      string,
        bindGroups:      GPUBindGroup[],
        workgroupCountX: number,
        workgroupCountY?: number,
        workgroupCountZ?: number,
    ): void;

    /**
     * Cria um GPUBindGroup compatível com o auto-layout do pipeline compilado.
     * Usa `pipeline.getBindGroupLayout(groupIndex)` internamente — garante
     * compatibilidade com pipelines criados sem layout explícito.
     *
     * @param pipelineId  — ID registrado em createComputePipeline()
     * @param groupIndex  — índice do @group() no shader (normalmente 0)
     * @param entries     — recursos a vincular (buffers, texturas, samplers)
     * @param label       — rótulo opcional para debugging
     */
    createBindGroupFromPipeline(
        pipelineId:  string,
        groupIndex:  number,
        entries:     GPUBindGroupEntry[],
        label?:      string,
    ): GPUBindGroup;

    /** @deprecated Preferir beginComputePassExplicit + dispatchOnPass para múltiplos dispatches. */
    beginComputePass(encoder: GPUCommandEncoder, label?: string): GPUComputePassEncoder;
    /** @deprecated Preferir beginComputePassExplicit + dispatchOnPass para múltiplos dispatches. */
    dispatch(encoder: GPUCommandEncoder, pipelineId: string, bindGroups: GPUBindGroup[], workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
}
