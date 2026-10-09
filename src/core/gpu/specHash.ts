import { v5 as uuidv5 } from 'uuid';
import type { ResourceSpec } from '../contracts/specs/ResourceSpec';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** Valores de `kind` que identificam uma spec de recurso aninhada (ver `ResourceSpec`). */
const SPEC_KINDS: ReadonlySet<string> = new Set([
    'buffer',
    'texture',
    'textureview',
    'sampler',
    'shader',
    'layout',
    'pipeline',
    'bindgroup',
    'bundle',
]);

/** Hash por objeto de spec. A spec é imutável (congelada por `create`), então o hash nunca envelhece. */
const memo = new WeakMap<object, string>();
/** Identidade das funções (`BundleSpec.body`): corpos distintos nunca colidem; o mesmo corpo deduplica. */
const functionIds = new WeakMap<object, number>();
let nextFunctionId = 1;

function functionId(fn: object): number {
    let id = functionIds.get(fn);
    if (id === undefined) {
        id = nextFunctionId++;
        functionIds.set(fn, id);
    }
    return id;
}

function isNestedSpec(value: object): boolean {
    const kind = (value as { kind?: unknown }).kind;
    return typeof kind === 'string' && SPEC_KINDS.has(kind) && !Array.isArray(value);
}

function stableStringify(value: unknown, seen: WeakSet<object>, root: boolean): string {
    if (typeof value === 'function') return `{"$fn":${functionId(value)}}`;
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'bigint') return `"${value.toString()}n"`;
        return JSON.stringify(value);
    }
    if (seen.has(value)) return '"<cycle>"';
    // Spec aninhada: entra pelo hash já memorizado — o conteúdo dela (ex.: WGSL) é serializado uma vez.
    if (!root && isNestedSpec(value)) {
        return `{"$spec":${JSON.stringify(hashOf(value, seen))}}`;
    }
    seen.add(value);

    if (Array.isArray(value)) {
        const parts = value.map((v) => stableStringify(v, seen, false));
        seen.delete(value);
        return `[${parts.join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => {
        const v = (value as Record<string, unknown>)[k];
        return `${JSON.stringify(k)}:${stableStringify(v, seen, false)}`;
    });
    seen.delete(value);
    return `{${parts.join(',')}}`;
}

function hashOf(spec: object, seen: WeakSet<object>): string {
    const cached = memo.get(spec);
    if (cached !== undefined) return cached;
    const hash = uuidv5(stableStringify(spec, seen, true), NAMESPACE);
    memo.set(spec, hash);
    return hash;
}

/**
 * Identidade de uma spec: UUIDv5 da serialização canônica (chaves ordenadas).
 *
 * - Calculada **uma vez por objeto** e memorizada por referência (`WeakMap`, coletada junto com a spec).
 * - **Composta**: specs aninhadas (shader num pipeline, layout/buffers num bind group) entram como
 *   `{"$spec": hash}` — o conteúdo de cada uma é serializado uma única vez.
 * - Funções entram por identidade de referência (`{"$fn": id}`).
 * - Conteúdo igual em todos os níveis ⇒ hash igual (deduplicação por conteúdo).
 *
 * Pressupõe spec imutável: `EngineCore.create`/`createAsync` a congelam em profundidade antes de hashear, de modo
 * que alterar uma spec depois de criada lança em vez de deixar um hash velho.
 */
export function specHash(spec: ResourceSpec): string {
    return hashOf(spec, new WeakSet<object>());
}
