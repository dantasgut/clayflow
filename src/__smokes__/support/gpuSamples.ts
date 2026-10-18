// Leituras de GPU dos smokes (spec 034, H1): cada quadro medido uma vez, pelo `gpuFrame`. Puras (sem o motor):
// testadas na CPU.

/** As estatísticas de quadro que o coletor lê (a forma de `FrameStats`). */
export interface GpuStats {
    readonly drawCalls?: number;
    readonly gpuTimeMs?: number;
    readonly gpuFrame?: number;
    readonly stagesNs?: Readonly<Record<string, number>>;
}

/** Mediana (0 sem amostras). */
export function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Leituras de GPU por quadro medido: cada `gpuFrame` entra uma vez; as de quadros até `fromFrame` (aquecimento)
 * ficam de fora. Pura: alimentada pelas estatísticas dos `frameComplete`.
 */
export class GpuFrameSamples {
    private readonly byFrame = new Map<number, GpuStats>();

    constructor(private fromFrame = -1) {}

    /** Descarta o que veio até aqui: só quadros medidos depois de `frame` contam. */
    restartAfter(frame: number): void {
        this.fromFrame = frame;
        this.byFrame.clear();
    }

    /** Uma estatística de quadro (as sem leitura de GPU, e as repetidas, são ignoradas). */
    add(stats: GpuStats): void {
        const frame = stats.gpuFrame;
        if (frame === undefined || stats.gpuTimeMs === undefined) return;
        if (frame <= this.fromFrame || this.byFrame.has(frame)) return;
        this.byFrame.set(frame, stats);
    }

    /** Tempos de GPU (ms) em ordem de quadro, um por quadro medido. */
    get times(): number[] {
        return [...this.byFrame.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s.gpuTimeMs!);
    }

    /** Quadros medidos. */
    get count(): number {
        return this.byFrame.size;
    }

    /** Tempo (ns) de cada rótulo de passe em cada quadro medido. */
    stages(): Map<string, number[]> {
        const out = new Map<string, number[]>();
        for (const s of this.byFrame.values())
            for (const [label, ns] of Object.entries(s.stagesNs ?? {})) {
                const list = out.get(label) ?? [];
                list.push(ns);
                out.set(label, list);
            }
        return out;
    }
}
