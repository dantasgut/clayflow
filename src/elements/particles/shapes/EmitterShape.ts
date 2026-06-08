/**
 * Sample retornado por `EmitterShape.sample()` — posição + velocidade
 * iniciais para uma partícula recém-spawned.
 */
export interface SpawnSample {
    /** Posição inicial em world coords. */
    readonly position: readonly [number, number, number];
    /** Velocidade inicial em world units / segundo. */
    readonly velocity: readonly [number, number, number];
}

/**
 * Shape de emissão — define o volume de onde partículas spawnam e
 * a direção inicial. Implementações: SphereEmitterShape (esfera),
 * ConeEmitterShape (cone direcional), etc.
 */
export interface EmitterShape {
    /**
     * Sampleia um novo spawn point. `rng` é uma função pseudo-random
     * (default: Math.random). Retorna position + velocity para a partícula.
     */
    sample(rng: () => number): SpawnSample;
}
