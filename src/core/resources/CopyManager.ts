import { WebGPUContext } from '../context/WebGPUContext';

/**
 * Operações de transferência de memória asssíncrona (Upload/Download e CPU-GPU-CPU)
 */
export class CopyManager {
    private context: WebGPUContext;

    constructor() {
        this.context = WebGPUContext.getInstance();
    }

    /**
     * Cópia intra-GPU direta (Ex: Salvar estado anterior de fisica).
     */
    public copyBufferToBuffer(
        encoder: GPUCommandEncoder,
        source: GPUBuffer,
        dest: GPUBuffer,
        size: number,
        srcOffset: number = 0,
        destOffset: number = 0
    ) {
        encoder.copyBufferToBuffer(source, srcOffset, dest, destOffset, size);
    }

    /**
     * Readback Assíncrono: Traz um buffer da GPU (geralmente gerado por um Compute Shader) de volta pro Javascript.
     * Usaremos muito isso para ler o output das fórmulas matemáticas se necessário exportar geometrias.
     */
    public async readBuffer(buffer: GPUBuffer, size: number): Promise<Float32Array> {
        // 1. Criar Buffer Staging (MAP_READ)
        const stagingBuffer = this.context.device.createBuffer({
            size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        // 2. Comanda a cópia
        const encoder = this.context.device.createCommandEncoder();
        encoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, size);
        this.context.queue.submit([encoder.finish()]);

        // 3. Mapeia e aguarda
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = stagingBuffer.getMappedRange();

        // 4. Copia os dados
        const result = new Float32Array(arrayBuffer.slice(0));

        // 5. Limpa memórias
        stagingBuffer.unmap();
        stagingBuffer.destroy();

        return result;
    }
}
