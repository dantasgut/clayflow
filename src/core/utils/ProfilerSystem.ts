import { WebGPUContext } from '../context/WebGPUContext';
import type { Profiler } from '../interfaces/Profiler';

/**
 * Encapsulamento das APIs de timestamp originárias direto no chip da Placa Gráfica.
 * Usado se device.features.has('timestamp-query') for true.
 */
export class ProfilerSystem implements Profiler {
    private context: WebGPUContext;
    private querySet: GPUQuerySet | null = null;
    private resolveBuffer: GPUBuffer | null = null;
    private resultBuffer: GPUBuffer | null = null;
    public isSupported: boolean = false;

    private readonly maxQueries = 128; // Suficiente para dezenas de medições por frame

    constructor() {
        this.context = WebGPUContext.getInstance();

        // Cuidado: Timestamp queries podem não estar suportadas por razões de segurança em alguns browsers
        if (this.context.device.features.has('timestamp-query')) {
            this.isSupported = true;
            this.initBuffers();
        } else {
            console.warn("Timestamp Queries não suportadas pela GPU/Navegador atual.");
        }
    }

    private initBuffers() {
        this.querySet = this.context.device.createQuerySet({
            label: 'ProfilerSystem_QuerySet',
            type: 'timestamp',
            count: this.maxQueries,
        });

        this.resolveBuffer = this.context.device.createBuffer({
            label: 'ProfilerSystem_ResolveBuffer',
            size: this.maxQueries * 8, // Cada timestamp gasta 64-bits (8 bytes)
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });

        this.resultBuffer = this.context.device.createBuffer({
            label: 'ProfilerSystem_ResultBuffer',
            size: this.maxQueries * 8,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    public writeTimestamp(passEncoder: GPUComputePassEncoder | GPURenderPassEncoder | GPUCommandEncoder, queryIndex: number) {
        if (!this.isSupported || !this.querySet) return;

        // Se a entidade suportar gravação direta (no meio de um passe geométrico/compute)
        if ('writeTimestamp' in passEncoder) {
            (passEncoder as any).writeTimestamp(this.querySet, queryIndex);
        } else {
            // Caso seja chamada num CommandEncoder global em volta do Passe
            console.error("writeTimestamp chamado em objeto inválido.", passEncoder);
        }
    }

    public resolveQueries(commandEncoder: GPUCommandEncoder, count: number) {
        if (!this.isSupported || !this.querySet || !this.resolveBuffer || !this.resultBuffer) return;

        commandEncoder.resolveQuerySet(this.querySet, 0, count, this.resolveBuffer, 0);
        commandEncoder.copyBufferToBuffer(this.resolveBuffer, 0, this.resultBuffer, 0, count * 8);
    }

    public async readResults(count: number): Promise<BigInt64Array | null> {
        if (!this.isSupported || !this.resultBuffer) return null;

        await this.resultBuffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = this.resultBuffer.getMappedRange();
        // Cópia os dados pois o buffer será desalocado da leitura local em seguida
        const timestamps = new BigInt64Array(arrayBuffer.slice(0, count * 8));
        this.resultBuffer.unmap();

        return timestamps;
    }
}
