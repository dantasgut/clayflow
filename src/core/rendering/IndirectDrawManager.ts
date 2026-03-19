import { WebGPUContext } from '../context/WebGPUContext';
import { EngineBuffer } from '../resources/EngineBuffer';
import type { IndirectDrawManager as IndirectDrawManagerInterface } from '../interfaces/IndirectDrawManager';

/**
 * Abstração pura de buffers Indirect. Evita que a CPU precise saber quantos vértices desenhar,
 * deixando que o Compute Shader preencha esse buffer nativamente para o Draw Pass ler.
 */
export class IndirectDrawManager implements IndirectDrawManagerInterface {
    private context: WebGPUContext;
    private indirectBuffers: Map<string, EngineBuffer>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.indirectBuffers = new Map();
    }

    public createDrawIndirectBuffer(id: string): EngineBuffer {
        // Struct GPUDrawIndirect = 4 uint32 (vertexCount, instanceCount, firstVertex, firstInstance) = 16 bytes
        const usage = GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const raw = this.context.device.createBuffer({
            label: `DrawIndirectBuffer_${id}`,
            size: 16,
            usage
        });
        const buf = new EngineBuffer(`DrawIndirectBuffer_${id}`, raw, 16, usage);
        this.indirectBuffers.set(id, buf);
        return buf;
    }

    public createDrawIndexedIndirectBuffer(id: string): EngineBuffer {
        // Struct GPUDrawIndexedIndirect = 5 uint32 = 20 bytes
        const usage = GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const raw = this.context.device.createBuffer({
            label: `DrawIndexedIndirectBuffer_${id}`,
            size: 20,
            usage
        });
        const buf = new EngineBuffer(`DrawIndexedIndirectBuffer_${id}`, raw, 20, usage);
        this.indirectBuffers.set(id, buf);
        return buf;
    }

    public getBuffer(id: string): EngineBuffer | undefined {
        return this.indirectBuffers.get(id);
    }
}
