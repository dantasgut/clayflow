import { v5 as uuidv5 } from 'uuid';
import type { ResourceSpec } from '../contracts/specs/ResourceSpec';

const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function stableStringify(value: unknown, seen: WeakSet<object>): string {
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'function') return '"<fn>"';
        if (typeof value === 'bigint') return `"${value.toString()}n"`;
        return JSON.stringify(value);
    }
    if (seen.has(value)) return '"<cycle>"';
    seen.add(value);

    if (Array.isArray(value)) {
        const parts = value.map((v) => stableStringify(v, seen));
        seen.delete(value as object);
        return `[${parts.join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => {
        const v = (value as Record<string, unknown>)[k];
        return `${JSON.stringify(k)}:${stableStringify(v, seen)}`;
    });
    seen.delete(value);
    return `{${parts.join(',')}}`;
}

export function specHash(spec: ResourceSpec): string {
    const canonical = stableStringify(spec, new WeakSet<object>());
    return uuidv5(canonical, NAMESPACE);
}
