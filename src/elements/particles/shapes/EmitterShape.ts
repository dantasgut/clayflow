export interface SpawnSample {
    readonly position: readonly [number, number, number];
    readonly velocity: readonly [number, number, number];
}

export interface EmitterShape {
    sample(rng: () => number): SpawnSample;
}
