/**
 * Intervalos livres de um pool (spec 008, faixas de pool): `[start, start + length)` ordenados e sem vizinhos colados
 * (a liberação coalesce). Serve à alocação de N slots contíguos por Resource; com N = 1 é a free-list de slots.
 */
export class FreeRanges {
    private readonly starts: number[] = [];
    private readonly lengths: number[] = [];

    /** Total de slots livres. */
    get size(): number {
        let total = 0;
        for (const length of this.lengths) total += length;
        return total;
    }

    /** Inícios possíveis de uma faixa de `n` slots, do menor para o maior. */
    *candidates(n: number): Generator<number> {
        for (let i = 0; i < this.starts.length; i++) {
            const start = this.starts[i]!;
            const last = start + this.lengths[i]! - n;
            for (let s = start; s <= last; s++) yield s;
        }
    }

    /** `[start, start + n)` está inteiramente livre? */
    contains(start: number, n: number): boolean {
        const i = this.indexAtOrBefore(start);
        return i >= 0 && start + n <= this.starts[i]! + this.lengths[i]!;
    }

    /** Tira `[start, start + n)` dos livres (a parte que estiver livre; o resto é ignorado). */
    take(start: number, n: number): void {
        const end = start + n;
        let i = this.indexAtOrBefore(start);
        if (i < 0) i = 0;
        while (i < this.starts.length && this.starts[i]! < end) {
            const s = this.starts[i]!;
            const e = s + this.lengths[i]!;
            if (e <= start) {
                i++;
                continue;
            }
            const left = start - s;
            const right = e - end;
            if (left > 0 && right > 0) {
                this.lengths[i] = left;
                this.starts.splice(i + 1, 0, end);
                this.lengths.splice(i + 1, 0, right);
                return;
            }
            if (left > 0) {
                this.lengths[i] = left;
                i++;
            } else if (right > 0) {
                this.starts[i] = end;
                this.lengths[i] = right;
                return;
            } else {
                this.starts.splice(i, 1);
                this.lengths.splice(i, 1);
            }
        }
    }

    /** Devolve `[start, start + n)` aos livres, juntando com os vizinhos colados. */
    release(start: number, n: number): void {
        if (n <= 0) return;
        let i = this.indexAtOrBefore(start) + 1;
        this.starts.splice(i, 0, start);
        this.lengths.splice(i, 0, n);
        if (i > 0 && this.endOf(i - 1) === start) {
            this.lengths[i - 1] = this.lengths[i - 1]! + n;
            this.starts.splice(i, 1);
            this.lengths.splice(i, 1);
            i--;
        }
        const next = i + 1;
        if (next < this.starts.length && this.endOf(i) === this.starts[next]) {
            this.lengths[i] = this.lengths[i]! + this.lengths[next]!;
            this.starts.splice(next, 1);
            this.lengths.splice(next, 1);
        }
    }

    /** Fim (exclusivo) do intervalo `i`. */
    private endOf(i: number): number {
        return this.starts[i]! + this.lengths[i]!;
    }

    /** Índice do último intervalo que começa em `slot` ou antes (`-1` se nenhum). */
    private indexAtOrBefore(slot: number): number {
        let lo = 0;
        let hi = this.starts.length - 1;
        let found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (this.starts[mid]! <= slot) {
                found = mid;
                lo = mid + 1;
            } else hi = mid - 1;
        }
        return found;
    }
}
