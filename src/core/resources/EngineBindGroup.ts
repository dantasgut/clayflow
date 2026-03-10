import { EngineResource } from './EngineResource';

export class EngineBindGroup extends EngineResource<GPUBindGroup> {
    public readonly layoutId: string;

    constructor(label: string, bindGroup: GPUBindGroup, layoutId: string) {
        super(label);
        this.rawGpuObject = bindGroup;
        this.layoutId = layoutId;
    }

    // GPUBindGroup não possui o método .destroy() no WebGPU nativo,
    // a placa lida com ele baseado nos buffers/textures amarrados.
    // Mas nós o anulamos na Engine para segurança.
    public destroy(): void {
        super.destroy();
    }
}
