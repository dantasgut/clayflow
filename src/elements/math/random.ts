// A aleatoriedade de produção do lado da CPU: só o que monta parâmetros por quadro (a rotação dos raios das sondas, por
// exemplo). A mesma aritmética u32 do `pcg_hash` do WGSL; dona da conta do lado da CPU (a referência f64,
// `reference/random.ts`, a reexporta e o teste dela confere os valores de controle).

/** PCG (hash de 32 bits, permutação RXS-M-XS). */
export function pcgHash(v: number): number {
    const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
    const word =
        Math.imul(((state >>> (((state >>> 28) + 4) >>> 0)) ^ state) >>> 0, 277803737) >>> 0;
    return ((word >>> 22) ^ word) >>> 0;
}
