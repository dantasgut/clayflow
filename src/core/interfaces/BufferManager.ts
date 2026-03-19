import { EngineBuffer } from '../resources/EngineBuffer';

export interface BufferManager {
    createUniformBuffer(id: string, size: number, usage?: GPUBufferUsageFlags): EngineBuffer;
    createStorageBuffer(id: string, size: number, usage?: GPUBufferUsageFlags): EngineBuffer;
    createVertexBuffer(id: string, size: number, usage?: GPUBufferUsageFlags): EngineBuffer;
    createIndexBuffer(id: string, size: number, usage?: GPUBufferUsageFlags): EngineBuffer;
    writeBuffer(id: string, data: Float32Array | Uint32Array | Int32Array | Uint16Array, offset?: number): void;
    
    /** Envia dados pesados (como vértices) usando um Staging Buffer nativo e um Command Encoder manual */
    uploadStagedAsync(destinationId: string, data: Float32Array | Uint16Array | Uint32Array): Promise<void>;
    getBuffer(id: string): EngineBuffer | undefined;
    destroyBuffer(id: string): void;
    destroyAll(): void;
}
