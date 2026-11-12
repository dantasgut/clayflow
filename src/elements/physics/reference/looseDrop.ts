// Spec 034 (T066d) — referência f64 da classificação da gota solta dos fluidos de partículas (`fluid_loose_drop`, em
// `fluid_bounds.wgsl`): a contagem de vizinhas fluidas contra o limite tomado só na parte aberta da vizinhança — a
// calota da esfera de alcance dentro do sólido mais próximo não tem vizinhas a contar. Para os testes (a fração aberta
// contra a contagem de uma rede de partículas cortada por uma parede).

/** Fração da esfera de raio `support` fora do meio-espaço sólido a distância `d` do centro (1 sem sólido ao alcance). */
export function openFraction(d: number, support: number): number {
    if (!(d < support)) return 1;
    const x = Math.min(Math.max(d / support, 0), 1);
    return 1 - ((1 - x) * (1 - x) * (2 + x)) / 4;
}

/**
 * A partícula com `count` vizinhas fluidas é gota solta? `threshold` 0 desliga; `wall` a distância ao sólido mais
 * próximo (`undefined` sem sólido ao alcance).
 */
export function looseDrop(
    count: number,
    threshold: number,
    wall: number | undefined,
    support: number,
): boolean {
    if (threshold === 0) return false;
    const open = wall === undefined ? 1 : openFraction(wall, support);
    return count < threshold * open;
}
