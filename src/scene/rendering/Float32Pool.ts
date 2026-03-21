/**
 * Object Pool para Float32Array (GoF Object Pool Pattern).
 * Elimina alocações GC por frame nas estratégias de extração.
 *
 * Uso:
 *   const arr = pool.acquire(16);  // obtém array de 16 floats (reutilizado)
 *   arr.set(source);               // preenche com dados
 *   // ao fim do frame: pool.reset() — arrays ficam disponíveis novamente
 */
export class Float32Pool {
    private buckets = new Map<number, Float32Array[]>();
    private cursors = new Map<number, number>();

    public acquire(size: number): Float32Array {
        let bucket = this.buckets.get(size);
        if (!bucket) {
            bucket = [];
            this.buckets.set(size, bucket);
            this.cursors.set(size, 0);
        }

        const cursor = this.cursors.get(size)!;
        if (cursor < bucket.length) {
            this.cursors.set(size, cursor + 1);
            return bucket[cursor]!;
        }

        const arr = new Float32Array(size);
        bucket.push(arr);
        this.cursors.set(size, cursor + 1);
        return arr;
    }

    public reset(): void {
        for (const size of this.buckets.keys()) {
            this.cursors.set(size, 0);
        }
    }
}
