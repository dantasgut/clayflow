import type { EngineBuffer } from '../resources/EngineBuffer';

export interface IndirectDrawManager {
    createDrawIndirectBuffer(id: string): EngineBuffer;
    createDrawIndexedIndirectBuffer(id: string): EngineBuffer;
    getBuffer(id: string): EngineBuffer | undefined;
}
