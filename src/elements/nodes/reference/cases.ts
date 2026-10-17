// Casos de teste dos nós de ponto da biblioteca (spec 031, R12): por nó, as amostras fixas (entradas e parâmetros), a
// referência da CPU (f64; aritmética inteira u32 exata nos ruídos) e a tolerância. Os mesmos casos servem ao teste da
// biblioteca (`__tests__/library.test.ts`: assinatura e valores conhecidos) e ao smoke `nodeGraphs` (parte f: cada nó
// avaliado na GPU contra a referência).

/** Valor de uma porta ou parâmetro: escalar, vetor ou matriz (colunas em sequência, como no WGSL). */
export type NodeValue = number | readonly number[];

/** Valores por nome de porta ou parâmetro. */
export type NodeValues = Readonly<Record<string, NodeValue>>;

/** Recurso de cena lido pelo nó (ex.: os registros dos campos prontos), que o kernel de teste liga com `records`. */
export interface NodeCaseScene {
    /** Nome do recurso declarado (`wgslResource`) na árvore do módulo do nó. */
    readonly resource: string;
    /** Registros do recurso (campos do schema dele). */
    readonly records: readonly NodeValues[];
}

/** Caso de teste de um nó de ponto. */
export interface NodeCase {
    /** Nome do nó (o do registro). */
    readonly node: string;
    /**
     * Tolerância por componente: `|gpu − referência| ≤ tolerance · max(1, |referência|)` (absoluta perto de zero,
     * relativa nos valores grandes).
     */
    readonly tolerance: number;
    /** Entradas e parâmetros da amostra `k` (gerador determinístico `random` em [0, 1)). */
    readonly sample: (random: () => number, k: number) => NodeValues;
    /** Saídas da referência da CPU, pelo nome. */
    readonly reference: (x: NodeValues) => NodeValues;
    /** Recurso de cena que o nó lê. */
    readonly scene?: NodeCaseScene;
    /**
     * O nó usa derivadas de tela (só no fragmento): o kernel de compute da parte f não o avalia; a GPU o confere no
     * smoke que o desenha (spec 011: `geometry.tangentUv` no `materials`).
     */
    readonly derivatives?: true;
}

/** Amostras por caso. */
const CASE_SAMPLES = 128;

/** Gerador determinístico (mulberry32) — o mesmo no teste e no smoke. */
function caseRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** As amostras do caso: `CASE_SAMPLES` valores, cada um arredondado ao f32 (o que a GPU recebe). */
export function caseSamples(c: NodeCase, seed: number): NodeValues[] {
    const random = caseRandom(seed);
    const f32 = (v: NodeValue): NodeValue =>
        typeof v === 'number' ? Math.fround(v) : v.map((x) => Math.fround(x));
    return Array.from({ length: CASE_SAMPLES }, (_, k) =>
        Object.fromEntries(Object.entries(c.sample(random, k)).map(([n, v]) => [n, f32(v)])),
    );
}

/** Uniforme em [lo, hi). */
export function uniform(random: () => number, lo: number, hi: number): number {
    return lo + (hi - lo) * random();
}

/** Vetor de `n` componentes uniformes em [lo, hi). */
export function vector(random: () => number, n: number, lo: number, hi: number): number[] {
    return Array.from({ length: n }, () => uniform(random, lo, hi));
}

/** Valor escalar. */
export function num(v: NodeValue | undefined): number {
    if (typeof v !== 'number') throw new Error('esperado escalar');
    return v;
}

/** Valor vetorial. */
export function vec(v: NodeValue | undefined): readonly number[] {
    if (v === undefined || typeof v === 'number') throw new Error('esperado vetor');
    return v;
}
