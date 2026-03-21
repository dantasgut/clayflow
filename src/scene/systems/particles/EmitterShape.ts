/**
 * Amostra de spawn: posição e direção de saída para uma nova partícula.
 */
export interface SpawnSample {
    readonly position: [number, number, number];
    /** Direção normalizada da velocidade inicial. */
    readonly direction: [number, number, number];
}

/**
 * Estratégia de forma de emissão. (Camada 2)
 *
 * Define de onde e em que direção novas partículas nascem.
 * Completamente desacoplada do emitter — pode ser trocada sem recriar o emitter.
 *
 * @example
 * emitter.shape = new ConeEmitterShape(Math.PI / 6);
 */
export interface EmitterShape {
    readonly id: string;
    /** Gera uma posição e direção inicial no espaço local do emitter. */
    sample(): SpawnSample;
}
