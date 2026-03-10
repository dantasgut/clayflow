import { EngineBuffer } from '../resources/EngineBuffer';

export interface BufferManager {
    createUniformBuffer(id: string, size: number, usage?: GPUBufferUsageFlags): EngineBuffer;
    createStorageBuffer(id: string, size: number, usage?: GPUBufferUsageFlags): EngineBuffer;
    createVertexBuffer(id: string, data: Float32Array, usage?: GPUBufferUsageFlags): EngineBuffer;
    createIndexBuffer(id: string, data: Uint16Array | Uint32Array, usage?: GPUBufferUsageFlags): EngineBuffer;
    writeBuffer(id: string, data: Float32Array | Uint32Array | Int32Array, offset?: number): void;
    getBuffer(id: string): EngineBuffer | undefined;
    destroyBuffer(id: string): void;
}
