/**
 * Conteúdo de geometria compartilhado por chave (spec 007, research R1).
 *
 * - **Paramétricas** (caixa, esfera, plano, superfície por função) geram vértices e índices uma vez por chave de
 *   parâmetros: todas as instâncias com os mesmos parâmetros recebem os mesmos arrays (não há cópia por instância). O
 *   conteúdo vive enquanto alguma instância o referencia (`WeakRef`).
 * - **Arrays do usuário** recebem a chave do hash dos bytes (FNV-1a, 64 bits em duas metades), com comparação de bytes
 *   quando dois conteúdos diferentes caem no mesmo hash.
 *
 * A Camada 2 usa a chave (`Resource.contentKey`) para deduplicar os buffers de vértice e índice. Mutar um array no
 * lugar não é rastreado (como todo typed array em `data`) e, num conteúdo compartilhado, mudaria todas as instâncias:
 * para mudar a forma de uma instância, atribua arrays novos (`data.vertices = …`), que ganham chave própria.
 */

/** Vértices e índices de uma geometria. */
export interface GeometryContent {
    readonly vertices: Float32Array;
    readonly indices: Uint16Array | Uint32Array;
}

const shared = new Map<string, WeakRef<GeometryContent>>();
const sharedCleanup = new FinalizationRegistry<string>((key) => {
    if (shared.get(key)?.deref() === undefined) shared.delete(key);
});

/** Chave de cada array de vértices conhecido (com o seu par de índices). */
const keyOfVertices = new WeakMap<
    Float32Array,
    { readonly indices: ArrayBufferView; readonly key: string }
>();
/** Conteúdos já vistos por hash, com o sufixo estável de cada um, para comparar bytes em colisão. */
const byHash = new Map<
    string,
    { readonly ref: WeakRef<GeometryContent>; readonly suffix: number }[]
>();
let nextSuffix = 1;

/**
 * Conteúdo da chave `key`: o já gerado, se alguma instância ainda o usa, ou o produzido por `build` agora (uma vez por
 * chave enquanto estiver em uso).
 */
export function sharedContent(key: string, build: () => GeometryContent): GeometryContent {
    const existing = shared.get(key)?.deref();
    if (existing !== undefined) return existing;
    const content = build();
    shared.set(key, new WeakRef(content));
    sharedCleanup.register(content, key);
    keyOfVertices.set(content.vertices, { indices: content.indices, key });
    return content;
}

/** Chave de conteúdo dos arrays: a do conteúdo compartilhado que os gerou, ou a do hash dos bytes. */
export function contentKeyOf(vertices: Float32Array, indices: Uint16Array | Uint32Array): string {
    const known = keyOfVertices.get(vertices);
    if (known?.indices === indices) return known.key;
    const key = hashKey({ vertices, indices });
    keyOfVertices.set(vertices, { indices, key });
    return key;
}

/** Identificador estável de uma função (chave de superfícies paramétricas pela identidade da função). */
const functionIds = new WeakMap<object, number>();
let nextFunctionId = 1;
export function functionId(fn: object): number {
    let id = functionIds.get(fn);
    if (id === undefined) {
        id = nextFunctionId++;
        functionIds.set(fn, id);
    }
    return id;
}

function hashKey(content: GeometryContent): string {
    const v = bytesOf(content.vertices);
    const i = bytesOf(content.indices);
    const hash = `${fnv1a(v, i, 0x811c9dc5).toString(16)}${fnv1a(v, i, 0x9e3779b9).toString(16)}`;
    const seen = (byHash.get(hash) ?? []).filter((e) => e.ref.deref() !== undefined);
    let entry = seen.find((e) => sameBytes(e.ref.deref()!, content));
    if (entry === undefined) {
        entry = { ref: new WeakRef(content), suffix: seen.length === 0 ? 0 : nextSuffix++ };
        seen.push(entry);
    }
    byHash.set(hash, seen);
    const kind = content.indices instanceof Uint32Array ? 'u32' : 'u16';
    return `bytes:${hash}:${kind}${entry.suffix === 0 ? '' : `#${entry.suffix}`}`;
}

function bytesOf(view: ArrayBufferView): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function fnv1a(a: Uint8Array, b: Uint8Array, seed: number): number {
    let h = seed >>> 0;
    for (let k = 0; k < a.length; k++) h = Math.imul(h ^ a[k]!, 0x01000193) >>> 0;
    h = Math.imul(h ^ 0xff, 0x01000193) >>> 0; // separador entre vértices e índices
    for (let k = 0; k < b.length; k++) h = Math.imul(h ^ b[k]!, 0x01000193) >>> 0;
    return h;
}

function sameBytes(x: GeometryContent, y: GeometryContent): boolean {
    if (x.indices.constructor !== y.indices.constructor) return false;
    const pairs: [Uint8Array, Uint8Array][] = [
        [bytesOf(x.vertices), bytesOf(y.vertices)],
        [bytesOf(x.indices), bytesOf(y.indices)],
    ];
    return pairs.every(([p, q]) => p.length === q.length && p.every((value, k) => value === q[k]));
}
