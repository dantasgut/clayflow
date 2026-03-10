import { WebGPUContext } from '../context/WebGPUContext';

/**
 * Abstração pura de buffers Indirect. Evita que a CPU precise saber quantos vértices desenhar,
 * deixando que o Compute Shader preencha esse buffer nativamente para o Draw Pass ler.
 */
export class IndirectDrawManager {
    private context: WebGPUContext;
    private indirectBuffers: Map<string, GPUBuffer>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.indirectBuffers = new Map();
    }

    public createDrawIndirectBuffer(id: string): GPUBuffer {
        // Struct GPUDrawIndirect = 4 uint32 (vertexCount, instanceCount, firstVertex, firstInstance) = 16 bytes
        const buffer = this.context.device.createBuffer({
            label: `DrawIndirectBuffer_${id}`,
            size: 16,
            usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST // Usa STORAGE para o Compute escrever nele
        });
        this.indirectBuffers.set(id, buffer);
        return buffer;
    }

    public createDrawIndexedIndirectBuffer(id: string): GPUBuffer {
        // Struct GPUDrawIndexedIndirect = 5 uint32 = 20 bytes
        const buffer = this.context.device.createBuffer({
            label: `DrawIndexedIndirectBuffer_${id}`,
            size: 20,
            usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.indirectBuffers.set(id, buffer);
        return buffer;
    }

    public getBuffer(id: string): GPUBuffer | undefined {
        return this.indirectBuffers.get(id);
    }
}
