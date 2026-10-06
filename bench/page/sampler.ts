import type { FrameSample } from '../core/types';

/** Quadros mínimos de aquecimento quando a opção não é informada. */
export const DEFAULT_WARMUP_FRAMES = 5;

/** Fase da amostragem após registrar um quadro. */
export type SamplerPhase = 'warmup' | 'measuring' | 'done' | 'timeout';

export interface SamplerOptions {
    readonly warmupMs: number;
    readonly windowMs: number;
    readonly timeoutMs: number;
    /**
     * Quadros mínimos de aquecimento, além do tempo: absorvem compilação de pipelines e outras
     * paradas dos primeiros quadros. Default 5.
     */
    readonly warmupFrames?: number;
    /** Relógio em ms (injetável para teste). */
    readonly now: () => number;
}

/** Amostras coletadas na janela de medição. */
export interface SampledWindow {
    readonly frameMs: number[];
    readonly cpuMs: number[];
    readonly gpuMs: number[];
    readonly drawCalls: number[];
}

/**
 * Amostrador de quadros: descarta o aquecimento, coleta intervalos entre quadros, CPU, draw
 * calls e leituras de GPU distintas durante a janela, e sinaliza fim ou tempo esgotado.
 * O mesmo amostrador serve às duas engines (intervalo medido igual — R6).
 */
export class FrameSampler {
    private startedAt = 0;
    private lastAt: number | null = null;
    private measuringSince: number | null = null;
    private lastGpuId: number | undefined;
    private warmupCount = 0;
    private readonly window: SampledWindow = { frameMs: [], cpuMs: [], gpuMs: [], drawCalls: [] };

    constructor(private readonly options: SamplerOptions) {}

    /** Marca o início (o tempo-limite conta a partir daqui). */
    start(): void {
        this.startedAt = this.options.now();
        this.lastAt = null;
    }

    /** Registra o quadro recém-executado e devolve a fase atual. */
    record(sample: FrameSample): SamplerPhase {
        const t = this.options.now();
        const prev = this.lastAt;
        this.lastAt = t;
        if (t - this.startedAt > this.options.timeoutMs) return 'timeout';
        if (this.measuringSince === null) {
            this.warmupCount++;
            const minFrames = this.options.warmupFrames ?? DEFAULT_WARMUP_FRAMES;
            if (t - this.startedAt < this.options.warmupMs || this.warmupCount < minFrames) {
                return 'warmup';
            }
            this.measuringSince = t;
            // Leituras de GPU anteriores à janela não contam.
            this.lastGpuId = sample.gpuSampleId;
            return 'measuring';
        }
        if (prev !== null) this.window.frameMs.push(t - prev);
        this.window.cpuMs.push(sample.cpuMs);
        this.window.drawCalls.push(sample.drawCalls);
        if (sample.gpuMs !== undefined && sample.gpuSampleId !== this.lastGpuId) {
            this.window.gpuMs.push(sample.gpuMs);
            this.lastGpuId = sample.gpuSampleId;
        }
        return t - this.measuringSince >= this.options.windowMs ? 'done' : 'measuring';
    }

    /**
     * Acrescenta uma leitura de GPU que chegou depois do último quadro da janela (readback
     * assíncrono). Devolve `true` se a leitura era nova.
     */
    lateGpuReading(reading: { gpuMs: number; id: number } | undefined): boolean {
        if (reading === undefined || reading.id === this.lastGpuId) return false;
        this.window.gpuMs.push(reading.gpuMs);
        this.lastGpuId = reading.id;
        return true;
    }

    /** Amostras da janela. */
    result(): SampledWindow {
        return this.window;
    }
}
