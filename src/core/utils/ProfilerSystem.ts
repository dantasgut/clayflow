import { WebGPUContext } from '../context/WebGPUContext';
import type { Profiler }  from '../interfaces/Profiler';
import { Loggable }       from '../debug/Loggable';
import { Logger }         from '../debug/Logger';

/**
 * Encapsulamento das APIs de timestamp originárias direto no chip da Placa Gráfica.
 * Usado se device.features.has('timestamp-query') for true.
 */
@Loggable('ProfilerSystem')
export class ProfilerSystem implements Profiler {
    declare private readonly log: Logger;
    private context: WebGPUContext;
    private querySet: GPUQuerySet | null = null;
    private resolveBuffer: GPUBuffer | null = null;
    private resultBuffer: GPUBuffer | null = null;
    public isSupported: boolean = false;
    /** Guard contra mapAsync concorrente (dois profilers não podem mapear o mesmo buffer). */
    private isMapped = false;

    /**
     * True se o resultBuffer não está mapeado nem com mapAsync pendente.
     * Deve ser verificado por TODOS os profilers antes de encodar resolveQueriesRange,
     * pois o resultBuffer é compartilhado e não pode ser submetido enquanto mapeado.
     */
    public get canResolve(): boolean { return !this.isMapped; }

    private readonly maxQueries = 128; // Suficiente para dezenas de medições por frame

    constructor() {
        this.context = WebGPUContext.getInstance();

        // Cuidado: Timestamp queries podem não estar suportadas por razões de segurança em alguns browsers
        if (this.context.device.features.has('timestamp-query')) {
            this.isSupported = true;
            this.initBuffers();
            this.log.info('Timestamp queries habilitadas');
        } else {
            this.log.warn('Timestamp queries indisponíveis neste device/navegador');
        }
    }

    private initBuffers() {
        this.querySet = this.context.device.createQuerySet({
            label: 'ProfilerSystem_QuerySet',
            type: 'timestamp',
            count: this.maxQueries,
        });

        // Tamanho do resolveBuffer precisa cobrir offsets alinhados a 256 bytes.
        // Cada slot de 32 queries ocupa um bloco de 256 bytes (32 × 8 bytes).
        // maxQueries=128 → ceil(128/32)=4 blocos → 4 × 256 = 1024 bytes.
        this.resolveBuffer = this.context.device.createBuffer({
            label: 'ProfilerSystem_ResolveBuffer',
            size: this.maxQueries * 8, // 1024 bytes — cobre todos os offsets alinhados a 256
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });

        this.resultBuffer = this.context.device.createBuffer({
            label: 'ProfilerSystem_ResultBuffer',
            size: this.maxQueries * 8,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    public timestampWritesForPass(beginIndex: number, endIndex: number): GPUComputePassTimestampWrites | undefined {
        if (!this.isSupported || !this.querySet) return undefined;
        return {
            querySet:                    this.querySet,
            beginningOfPassWriteIndex:   beginIndex,
            endOfPassWriteIndex:         endIndex,
        };
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
        if (!this.isSupported || !this.resultBuffer || this.isMapped) return null;
        this.isMapped = true;
        try {
            await this.resultBuffer.mapAsync(GPUMapMode.READ);
            const arrayBuffer = this.resultBuffer.getMappedRange();
            const timestamps = new BigInt64Array(arrayBuffer.slice(0, count * 8));
            this.resultBuffer.unmap();
            return timestamps;
        } finally {
            this.isMapped = false;
        }
    }

    /**
     * Calcula o offset de destino alinhado a 256 bytes para um dado firstQuery.
     *
     * A spec WebGPU exige que o destinationOffset de resolveQuerySet seja múltiplo de 256.
     * Como cada timestamp ocupa 8 bytes, firstQuery deve ser múltiplo de 32 para que
     * firstQuery*8 seja múltiplo de 256. Para queries não-alinhadas (ex: firstQuery=8 → 64 bytes),
     * arredondamos para o próximo bloco de 256 (256 bytes).
     */
    private static alignedOffset(firstQuery: number): number {
        return Math.ceil(firstQuery * 8 / 256) * 256;
    }

    public resolveQueriesRange(
        commandEncoder: GPUCommandEncoder,
        firstQuery: number,
        count: number,
    ): void {
        if (!this.isSupported || !this.querySet || !this.resolveBuffer || !this.resultBuffer) return;
        const offset = ProfilerSystem.alignedOffset(firstQuery);
        commandEncoder.resolveQuerySet(this.querySet, firstQuery, count, this.resolveBuffer, offset);
        commandEncoder.copyBufferToBuffer(this.resolveBuffer, offset, this.resultBuffer, offset, count * 8);
    }

    public async readResultsRange(firstQuery: number, count: number): Promise<BigInt64Array | null> {
        if (!this.isSupported || !this.resultBuffer || this.isMapped) return null;
        this.isMapped = true;
        try {
            const byteOffset = ProfilerSystem.alignedOffset(firstQuery);
            const byteSize   = count * 8;
            await this.resultBuffer.mapAsync(GPUMapMode.READ, byteOffset, byteSize);
            const arrayBuffer = this.resultBuffer.getMappedRange(byteOffset, byteSize);
            // Cópia relativa ao início da faixa mapeada (índice 0 = firstQuery)
            const timestamps = new BigInt64Array(arrayBuffer.slice(0));
            this.resultBuffer.unmap();
            return timestamps;
        } finally {
            this.isMapped = false;
        }
    }
}
