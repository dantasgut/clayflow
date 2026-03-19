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
    private _buckets = new Map<number, Float32Array[]>();
    private _cursors = new Map<number, number>();

    public acquire(size: number): Float32Array {
        let bucket = this._buckets.get(size);
        if (!bucket) {
            bucket = [];
            this._buckets.set(size, bucket);
            this._cursors.set(size, 0);
        }

        const cursor = this._cursors.get(size)!;
        if (cursor < bucket.length) {
            this._cursors.set(size, cursor + 1);
            return bucket[cursor]!;
        }

        const arr = new Float32Array(size);
        bucket.push(arr);
        this._cursors.set(size, cursor + 1);
        return arr;
    }

    public reset(): void {
        for (const size of this._buckets.keys()) {
            this._cursors.set(size, 0);
        }
    }
}
