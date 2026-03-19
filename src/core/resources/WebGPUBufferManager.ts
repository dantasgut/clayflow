import { WebGPUContext } from '../context/WebGPUContext';
import { EngineBuffer } from './EngineBuffer';
import type { BufferManager } from '../interfaces/BufferManager';

/**
 * Gerenciador Abstrato de Buffers (Camada 1).
 * Agora retorna EngineBuffers controlados em vez de raw GPUObjectBase.
 */
export class WebGPUBufferManager implements BufferManager {
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

    public createStorageBuffer(id: string, size: number, usage: GPUBufferUsageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `StorageBuffer_${id}`,
            size: Math.ceil(size / 4) * 4,
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`StorageBuffer_${id}`, rawBuffer, size, usage);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public createVertexBuffer(id: string, size: number, usage: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `VertexBuffer_${id}`,
            size: size,
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`VertexBuffer_${id}`, rawBuffer, size, usage);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public createIndexBuffer(id: string, size: number, usage: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST): EngineBuffer {
        const rawBuffer = this.context.device.createBuffer({
            label: `IndexBuffer_${id}`,
            size: size,
            usage: usage,
        });
        const engineBuf = new EngineBuffer(`IndexBuffer_${id}`, rawBuffer, size, usage);
        this.buffers.set(id, engineBuf);
        return engineBuf;
    }

    public writeBuffer(id: string, data: Float32Array | Uint32Array | Int32Array | Uint16Array, offset: number = 0): void {
        const engineBuf = this.buffers.get(id);
        if (!engineBuf) return;
        this.context.queue.writeBuffer(engineBuf.native, offset, data.buffer, data.byteOffset, data.byteLength);
    }

    /**
     * Fluxo profissional de Upload pesado: Cria Staging Buffer mapeável, copia pela CPU, e cria um GPUCommandEncoder manual 
     * para transferir para a VRAM restrita. (Usado pela Camada 2 para malhas paradas).
     */
    public async uploadStagedAsync(destinationId: string, data: Float32Array | Uint16Array | Uint32Array): Promise<void> {
        const destBuf = this.buffers.get(destinationId);
        if (!destBuf) throw new Error(`Destino ${destinationId} inexistente para Staging.`);

        // 1. Cria Staging Buffer na RAM (Mapeável para CPU Write, legível por GPU Copy)
        const stagingBuffer = this.context.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true
        });

        // 2. Escreve arrays crus diretamente no ponteiro de memória mapeada
        const arrayBuffer = stagingBuffer.getMappedRange();
        if (data instanceof Float32Array) {
            new Float32Array(arrayBuffer).set(data);
        } else if (data instanceof Uint16Array) {
            new Uint16Array(arrayBuffer).set(data);
        } else {
            new Uint32Array(arrayBuffer).set(data);
        }
        
        // 3. Libera o mapeamento para a GPU poder acessar
        stagingBuffer.unmap();

        // 4. Criação Explícita de COMMAND BUFFER
        const encoder = this.context.device.createCommandEncoder({ label: `Staging_Encoder_${destinationId}` });
        encoder.copyBufferToBuffer(stagingBuffer, 0, destBuf.native, 0, data.byteLength);

        // 5. Envia o CommandBuffer para o fluxo da Placa de Vídeo
        this.context.queue.submit([encoder.finish()]);

        // 6. Limpa memória RAM do staging
        stagingBuffer.destroy();
    }

    public getBuffer(id: string): EngineBuffer | undefined {
        return this.buffers.get(id);
    }

    public destroyBuffer(id: string): void {
        const engineBuf = this.buffers.get(id);
        if (engineBuf) {
            engineBuf.destroy();
            this.buffers.delete(id);
        }
    }

    public destroyAll(): void {
        for (const engineBuf of this.buffers.values()) {
            engineBuf.destroy();
        }
        this.buffers.clear();
    }
}
