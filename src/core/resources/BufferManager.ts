import { WebGPUContext } from '../context/WebGPUContext';
import { EngineBuffer } from './EngineBuffer';
import type { IBufferManager } from '../interfaces/IBufferManager';

/**
 * Gerenciador Abstrato de Buffers (Camada 1).
 * Agora retorna EngineBuffers controlados em vez de raw GPUObjectBase.
 */
export class BufferManager implements IBufferManager {
    private context: WebGPUContext;
    private buffers: Map<string, EngineBuffer>;

    constructor() {
        this.context = WebGPUContext.getInstance();
        this.buffers = new Map();
    }

    public createUniformBuffer(id: string, size: number, usage: GPUBufferUsageFlags = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `UniformBuffer_${id}`,
            size: Math.ceil(size / 16) * 16, // Alinha aos blocos std140 de 16 bytes
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`UniformBuffer_${id}`, rawBuffer, size, usage);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public createStorageBuffer(id: string, size: number, usage: GPUBufferUsageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `StorageBuffer_${id}`,
            size: Math.ceil(size / 4) * 4,
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`StorageBuffer_${id}`, rawBuffer, size, usage);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public createVertexBuffer(id: string, data: Float32Array, usage: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `VertexBuffer_${id}`,
            size: data.byteLength,
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`VertexBuffer_${id}`, rawBuffer, data.byteLength, usage);
        this.context.queue.writeBuffer(rawBuffer, 0, data.buffer, data.byteOffset, data.byteLength);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public createIndexBuffer(id: string, data: Uint16Array | Uint32Array, usage: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `IndexBuffer_${id}`,
            size: data.byteLength,
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`IndexBuffer_${id}`, rawBuffer, data.byteLength, usage);
        this.context.queue.writeBuffer(rawBuffer, 0, data.buffer, data.byteOffset, data.byteLength);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public writeBuffer(id: string, data: Float32Array | Uint32Array | Int32Array, offset: number = 0): void {
        const engineBuf = this.buffers.get(id);
        if (!engineBuf) {
            console.error(`Buffer ${id} não encontrado.`);
            return;
        }
        this.context.queue.writeBuffer(engineBuf.native, offset, data.buffer, data.byteOffset, data.byteLength);
    }

    public getBuffer(id: string): EngineBuffer | undefined {
        return this.buffers.get(id);
    }

    public destroyBuffer(id: string): void {
        const engineBuf = this.buffers.get(id);
        if (engineBuf) {
            engineBuf.destroy(); // Aciona destroy na nativa e loga liberação
            this.buffers.delete(id);
        }
    }
}
