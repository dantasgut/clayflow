import { WebGPUContext } from '../context/WebGPUContext';
import type { EngineBuffer } from './EngineBuffer';
import type { CopyManager as CopyManagerInterface } from '../interfaces/CopyManager';

/**
 * Operações de transferência de memória assíncrona (GPU-GPU e GPU->CPU readback).
 */
export class CopyManager implements CopyManagerInterface {
    private context: WebGPUContext;

    constructor() {
        this.context = WebGPUContext.getInstance();
    }

    /**
     * Cópia intra-GPU direta (ex: salvar estado anterior de física).
     */
    public copyBufferToBuffer(
        encoder: GPUCommandEncoder,
        source: EngineBuffer,
        dest: EngineBuffer,
        size: number,
        srcOffset: number = 0,
        destOffset: number = 0
    ): void {
        encoder.copyBufferToBuffer(source.native, srcOffset, dest.native, destOffset, size);
    }

    /**
     * Readback assíncrono: traz um buffer da GPU de volta para o JavaScript.
     */
    public async readBuffer(source: EngineBuffer, size: number): Promise<Float32Array> {
        const stagingBuffer = this.context.device.createBuffer({
            size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        const encoder = this.context.device.createCommandEncoder();
        encoder.copyBufferToBuffer(source.native, 0, stagingBuffer, 0, size);
        this.context.queue.submit([encoder.finish()]);

        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
        stagingBuffer.unmap();
        stagingBuffer.destroy();

        return result;
    }
}
