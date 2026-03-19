import type { EngineBuffer } from '../resources/EngineBuffer';

export interface CopyManager {
    copyBufferToBuffer(encoder: GPUCommandEncoder, source: EngineBuffer, dest: EngineBuffer, size: number, srcOffset?: number, destOffset?: number): void;
    readBuffer(source: EngineBuffer, size: number): Promise<Float32Array>;
}
