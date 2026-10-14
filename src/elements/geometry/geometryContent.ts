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

/** Conteúdo compartilhado: vértices, índices e as arestas de arame (de feição; spec 008). */
export interface SharedGeometryContent extends GeometryContent {
    readonly wireEdges: Uint32Array;
}

const shared = new Map<string, WeakRef<SharedGeometryContent>>();
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
export function sharedContent(key: string, build: () => GeometryContent): SharedGeometryContent {
    const existing = shared.get(key)?.deref();
    if (existing !== undefined) return existing;
    const built = build();
    // Arestas de arame calculadas com o conteúdo (uma vez por chave).
    const content: SharedGeometryContent = {
        ...built,
        wireEdges: featureEdges(built.vertices, built.indices),
    };
    shared.set(key, new WeakRef(content));
    sharedCleanup.register(content, key);
    keyOfVertices.set(content.vertices, { indices: content.indices, key });
    return content;
}

/** Floats por vértice no layout do forward (posição, normal, uv). */
const VERTEX_FLOATS = 8;

/**
 * Arestas de arame de uma malha estática (spec 008), em espaço de objeto — o que o arame desenha: pares de índices de
 * vértice. Os vértices são unidos por posição (faces com vértices próprios, como as da caixa, compartilham a aresta);
 * uma aresta sai uma vez e só se é de borda ou separa triângulos não coplanares — a diagonal de uma face plana some.
 */
export function featureEdges(vertices: Float32Array, indices: ArrayLike<number>): Uint32Array {
    const canonical = new Map<string, number>();
    const weld = (v: number): number => {
        const o = v * VERTEX_FLOATS;
        const key = `${vertices[o]},${vertices[o + 1]},${vertices[o + 2]}`;
        let id = canonical.get(key);
        if (id === undefined) canonical.set(key, (id = v));
        return id;
    };
    const normal = (a: number, b: number, c: number): [number, number, number] => {
        const p = (v: number, k: number): number => vertices[v * VERTEX_FLOATS + k]!;
        const ux = p(b, 0) - p(a, 0),
            uy = p(b, 1) - p(a, 1),
            uz = p(b, 2) - p(a, 2);
        const vx = p(c, 0) - p(a, 0),
            vy = p(c, 1) - p(a, 1),
            vz = p(c, 2) - p(a, 2);
        const nx = uy * vz - uz * vy,
            ny = uz * vx - ux * vz,
            nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        return [nx / len, ny / len, nz / len];
    };
    const edges = new Map<string, { a: number; b: number; normals: [number, number, number][] }>();
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
        const n = normal(tri[0]!, tri[1]!, tri[2]!);
        for (let k = 0; k < 3; k++) {
            const a = tri[k]!;
            const b = tri[(k + 1) % 3]!;
            const wa = weld(a);
            const wb = weld(b);
            const key = wa < wb ? `${wa}:${wb}` : `${wb}:${wa}`;
            const edge = edges.get(key);
            if (edge === undefined) edges.set(key, { a, b, normals: [n] });
            else edge.normals.push(n);
        }
    }
    const out: number[] = [];
    for (const { a, b, normals } of edges.values()) {
        const [first, ...rest] = normals;
        const crease = rest.some(
            (n) => Math.abs(n[0] * first![0] + n[1] * first![1] + n[2] * first![2]) < 0.9999,
        );
        if (normals.length === 1 || crease) out.push(a, b);
    }
    return Uint32Array.from(out);
}

/**
 * Arestas topológicas de uma malha (spec 008): cada aresta dos triângulos uma vez, sem critério de feição — para malhas
 * que deformam (a forma muda a cada quadro; a aresta continua sendo do arame).
 */
export function triangleEdges(indices: ArrayLike<number>): Uint32Array {
    const seen = new Set<string>();
    const out: number[] = [];
    for (let t = 0; t + 2 < indices.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const a = indices[t + k]!;
            const b = indices[t + ((k + 1) % 3)]!;
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(a, b);
        }
    }
    return Uint32Array.from(out);
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
