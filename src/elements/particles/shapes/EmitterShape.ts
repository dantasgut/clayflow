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
    /** A forma para a emissão na GPU (`ComputeParticleEmitter`, spec 009): tipo e vetores lidos por `emit_fn_ready`. */
    gpu(): EmitterShapeGpu;
}

/** Forma pronta na GPU (spec 009): 0 ponto, 1 esfera, 2 cone; `a`, `b`, `s` como em `emit_fn_ready.wgsl`. */
export interface EmitterShapeGpu {
    readonly kind: 0 | 1 | 2;
    readonly a: readonly [number, number, number];
    readonly b: readonly [number, number, number];
    readonly s: readonly [number, number];
}
