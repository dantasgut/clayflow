import { EngineResource } from './EngineResource';

export class EngineBuffer extends EngineResource<GPUBuffer> {
    public readonly size: number;
    public readonly usage: GPUBufferUsageFlags;

    constructor(label: string, buffer: GPUBuffer, size: number, usage: GPUBufferUsageFlags) {
        super(label);
        this.rawGpuObject = buffer;
        this.size = size;
        this.usage = usage;
    }

    public destroy(): void {
        this.native.destroy();
        super.destroy(); // Nullifica
    }
}
