/** Par de índices de timestamp de um passe (início/fim) com o rótulo do passe. */
export interface TimestampPair {
    readonly first: number;
    readonly last: number;
    readonly label: string;
}

/**
 * Alocador de pares de timestamps por quadro — lógica pura, sem tipos WebGPU.
 *
 * O QuerySet do profiler é dividido em duas regiões: `[0, base)` é dos índices
 * manuais (`Profiler.timestampWritesFor`) e `[base, base + capacity)` é deste
 * alocador. Cada passe sem timestamps explícitos recebe um par; passes com
 * timestamps explícitos são registrados para entrarem na soma.
 */
export class FrameTimestampAllocator {
    private next: number;
    private readonly list: TimestampPair[] = [];
    private overflow = false;
    private frame = 0;

    constructor(
        /** Número de timestamps da região automática (2 por passe). */
        readonly capacity: number,
        /** Primeiro índice da região automática no QuerySet. */
        readonly base = 0,
    ) {
        this.next = base;
    }

    /** Abre um quadro: zera pares e estouro. */
    begin(frameIndex: number): void {
        this.frame = frameIndex;
        this.next = this.base;
        this.list.length = 0;
        this.overflow = false;
    }

    /** Índice do quadro aberto por `begin`. */
    get frameIndex(): number {
        return this.frame;
    }

    /** True se algum passe do quadro ficou sem par por falta de capacidade. */
    get overflowed(): boolean {
        return this.overflow;
    }

    /** Pares do quadro (automáticos e explícitos), na ordem dos passes. */
    get pairs(): readonly TimestampPair[] {
        return this.list;
    }

    /** Fim (exclusivo) do maior índice usado no quadro — quantos timestamps resolver. */
    get end(): number {
        let end = 0;
        for (const p of this.list) end = Math.max(end, p.first + 1, p.last + 1);
        return end;
    }

    /** Reserva um par na região automática; `undefined` (e estouro) quando não cabe. */
    allocatePair(label: string): TimestampPair | undefined {
        if (this.next + 2 > this.base + this.capacity) {
            this.overflow = true;
            return undefined;
        }
        const pair = { first: this.next, last: this.next + 1, label };
        this.next += 2;
        this.list.push(pair);
        return pair;
    }

    /** Registra um par de timestamps explícitos (respeitado e somado). */
    registerExplicit(pair: TimestampPair): void {
        this.list.push(pair);
    }

    /**
     * Soma dos intervalos válidos em ms. Ignora pares com `last < first` ou fora do
     * array (timestamp inválido); `undefined` quando nenhum par é válido.
     */
    static sumIntervals(ns: BigInt64Array, pairs: readonly TimestampPair[]): number | undefined {
        let total = 0;
        let valid = 0;
        for (const p of pairs) {
            const d = FrameTimestampAllocator.interval(ns, p);
            if (d === undefined) continue;
            total += d;
            valid++;
        }
        return valid === 0 ? undefined : total / 1e6;
    }

    /** Intervalos válidos em ns agrupados por rótulo (rótulos repetidos acumulam). */
    static intervalsByLabel(
        ns: BigInt64Array,
        pairs: readonly TimestampPair[],
    ): Record<string, number> {
        const out: Record<string, number> = {};
        for (const p of pairs) {
            const d = FrameTimestampAllocator.interval(ns, p);
            if (d === undefined) continue;
            out[p.label] = (out[p.label] ?? 0) + d;
        }
        return out;
    }

    private static interval(ns: BigInt64Array, p: TimestampPair): number | undefined {
        const a = ns[p.first];
        const b = ns[p.last];
        if (a === undefined || b === undefined || b < a) return undefined;
        return Number(b - a);
    }
}
