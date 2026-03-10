import { EngineResource } from './EngineResource';

export class EngineTexture extends EngineResource<GPUTexture> {
    public readonly width: number;
    public readonly height: number;
    public readonly depth: number;
    public readonly format: GPUTextureFormat;

    constructor(
        label: string, 
        texture: GPUTexture, 
        width: number, 
        height: number, 
        depth: number = 1, 
        format: GPUTextureFormat
    ) {
        super(label);
        this.rawGpuObject = texture;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.format = format;
    }

    public destroy(): void {
        this.native.destroy();
        super.destroy();
    }
}
