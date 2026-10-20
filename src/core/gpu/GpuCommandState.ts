type ActivePassKind = 'compute' | 'render';

interface ActivePass {
    readonly kind: ActivePassKind;
    readonly encoder: GPUComputePassEncoder | GPURenderPassEncoder;
}

export class GpuCommandState {
    private encoder: GPUCommandEncoder | null = null;
    private readonly passStack: ActivePass[] = [];
    /** Grupos de depuração abertos, de fora para dentro. */
    private readonly markers: string[] = [];

    open(device: GPUDevice, label?: string): void {
        if (this.encoder !== null) {
            throw new Error('GpuCommandState: encoder already open.');
        }
        this.encoder = device.createCommandEncoder(label !== undefined ? { label } : {});
    }

    requireEncoder(): GPUCommandEncoder {
        if (this.encoder === null) {
            throw new Error('GpuCommandState: no active encoder. Wrap calls in core.record(...).');
        }
        return this.encoder;
    }

    pushPass(pass: ActivePass): void {
        this.passStack.push(pass);
    }

    popPass(expected: ActivePassKind): void {
        const top = this.passStack.pop();
        if (top?.kind !== expected) {
            throw new Error(`GpuCommandState: pass stack mismatch on pop ${expected}.`);
        }
    }

    enterMarker(label: string): void {
        this.markers.push(label);
    }

    leaveMarker(): void {
        this.markers.pop();
    }

    /** Caminho dos grupos abertos (`fase/Flow`), vazio fora de grupo. */
    get scope(): string {
        return this.markers.join('/');
    }

    finishAndClose(): GPUCommandBuffer {
        if (this.encoder === null) {
            throw new Error('GpuCommandState: no encoder to finish.');
        }
        if (this.passStack.length !== 0) {
            throw new Error('GpuCommandState: passes not closed before submit.');
        }
        if (this.markers.length !== 0) {
            throw new Error('GpuCommandState: markers not balanced before submit.');
        }
        const cmd = this.encoder.finish();
        this.encoder = null;
        return cmd;
    }
}
