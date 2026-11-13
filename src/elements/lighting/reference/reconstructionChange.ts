// Referência em f64 do gradiente temporal da reconstrução da refração em meia resolução (spec 034, T066d; só para
// testes): a regra de `refraction_block_changed` e da etiqueta do último traçado (`refraction_trace_tag`, em
// `refraction_chain.wgsl`). O representante de um bloco 2 × 2 é traçado agora numa posição da tela (o pixel mais o
// deslocamento da amostra); entre os últimos traçados dos pixels 3 × 3 em volta (do mesmo objeto), o de amostra mais perto
// na tela diz o que o bloco mostrava: com a cena parada, o ponto mostrado anda no máximo a largura por pixel no ponto
// vezes a distância entre as amostras; acima de `KEEP_DRIFT` vezes isso, o que o bloco mostra mudou.

/** Passos do deslocamento da amostra por eixo na etiqueta (5 bits). */
export const TRACE_STEPS = 31;
/** A folga sobre o andar do ponto com a cena parada (`REFRACTION_KEEP_DRIFT`). */
export const KEEP_DRIFT = 3;

/** Ponto 3D. */
export type P3 = readonly [number, number, number];
/** Posição na tela (pixels). */
export type P2 = readonly [number, number];

/**
 * A etiqueta do último traçado: o registro em 20 bits, o deslocamento `jitter` (pixels) em 5 + 5 bits, a discordância
 * `off` no bit 30 e o bit 31.
 */
export function traceTag(record: number, jitter: P2, off = false): number {
    const step = (j: number): number => Math.round(Math.min(Math.max(j + 0.5, 0), 1) * TRACE_STEPS);
    return (
        (Math.min(record, 0xfffff)
            | (step(jitter[0]) << 20)
            | (step(jitter[1]) << 25)
            | (off ? 0x40000000 : 0)
            | 0x80000000)
        >>> 0
    );
}

/** O deslocamento da amostra (pixels) na etiqueta `tag`. */
export function traceJitter(tag: number): P2 {
    return [((tag >>> 20) & 31) / TRACE_STEPS - 0.5, ((tag >>> 25) & 31) / TRACE_STEPS - 0.5];
}

/** O registro (20 bits) na etiqueta `tag`. */
export function traceRecord(tag: number): number {
    return tag & 0xfffff;
}

/** O último traçado de um pixel: o pixel, a etiqueta e o ponto em que terminou. */
export interface Trace {
    readonly pixel: P2;
    readonly tag: number;
    readonly point: P3;
}

const dist = (a: readonly number[], b: readonly number[]): number =>
    Math.hypot(...a.map((x, k) => x - (b[k] ?? 0)));

/**
 * O que o bloco do representante `rep` (traçado agora com o deslocamento `jitter`, terminando em `end` do objeto
 * `record`) mostra mudou desde os traçados `traces` em volta? `scale`: a largura por pixel no ponto. As duas amostras
 * mais perto na tela decidem: a mais perto discorda e a segunda (quando há) confirma. Sem traçado do mesmo objeto, não se
 * sabe: falso.
 */
export function blockChanged(
    rep: P2,
    jitter: P2,
    end: P3,
    record: number,
    scale: number,
    traces: readonly Trace[],
): boolean {
    const now: P2 = [rep[0] + 0.5 + jitter[0], rep[1] + 0.5 + jitter[1]];
    const id = Math.min(record, 0xfffff);
    const seen = traces
        .filter(
            (t) =>
                t.tag >>> 31 === 1
                && traceRecord(t.tag) === id
                && Math.abs(t.pixel[0] - rep[0]) <= 1
                && Math.abs(t.pixel[1] - rep[1]) <= 1,
        )
        .map((t) => {
            const j = traceJitter(t.tag);
            const gap = dist([t.pixel[0] + 0.5 + j[0], t.pixel[1] + 0.5 + j[1]], now);
            return {
                gap,
                off: dist(t.point, end) > KEEP_DRIFT * scale * Math.max(gap, 1 / TRACE_STEPS),
            };
        })
        .sort((a, b) => a.gap - b.gap);
    const [first, second] = seen;
    if (first === undefined) return false;
    return first.off && (second === undefined || second.off);
}

/**
 * A mudança do bloco (`RefractionBlock.change`): 0 o ponto concorda, 1 discorda só agora, 2 mudou — discorda agora e
 * discordava num traçado anterior do bloco (`previous`: o bit 30 das etiquetas dos pixels dele).
 */
export function blockChange(off: boolean, previous: readonly boolean[]): 0 | 1 | 2 {
    if (!off) return 0;
    return previous.some((p) => p) ? 2 : 1;
}
