import type { BindingEntry, BindingLayoutEntry } from '../../../core/contracts/index';
import type { ResolvedSource } from '../../consumers/ResolvedSource';
import type { BindingSource } from '../../flows/FlowBinding';
import type { InferredEntry } from '../LayoutInferencer';

/** Fonte completa de um binding privado (forma abreviada → `ResolvedSource`). */
export function normalizeSource(source: BindingSource): ResolvedSource {
    if (source.kind === 'buffer') {
        return 'subkind' in source ? { kind: 'buffer', buffer: source } : source;
    }
    if (source.kind === 'textureview') return { kind: 'textureView', view: source };
    if (source.kind === 'sampler') {
        return 'sampler' in source ? source : { kind: 'sampler', sampler: source };
    }
    return source;
}

/** Mesma fonte (mesmos objetos de GPU e a mesma região)? */
export function sameSource(a: ResolvedSource, b: ResolvedSource): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'buffer' && b.kind === 'buffer') {
        return (
            a.buffer === b.buffer
            && a.offset === b.offset
            && a.size === b.size
            && a.dynamic?.stride === b.dynamic?.stride
        );
    }
    if (a.kind === 'textureView' && b.kind === 'textureView') return a.view === b.view;
    if (a.kind === 'sampler' && b.kind === 'sampler') return a.sampler === b.sampler;
    return false;
}

/** Entrada do bind group para a fonte no binding. */
export function bindingEntryOf(binding: number, source: ResolvedSource): BindingEntry {
    switch (source.kind) {
        case 'buffer':
            return {
                binding,
                kind: 'buffer',
                buffer: source.buffer,
                ...(source.offset !== undefined ? { offset: source.offset } : {}),
                ...(source.size !== undefined ? { size: source.size } : {}),
            };
        case 'textureView':
            return { binding, kind: 'textureview', view: source.view };
        case 'sampler':
            return { binding, kind: 'sampler', sampler: source.sampler };
    }
}

/** Formatos de cor que não são filtráveis sem a feature `float32-filterable` (amostrados como `unfilterable-float`). */
const UNFILTERABLE: ReadonlySet<string> = new Set(['r32float', 'rg32float', 'rgba32float']);

/**
 * Entrada de layout para o binding inferido com a fonte resolvida, ou a razão da incompatibilidade (string).
 * `visibility` explícita (da fonte ou do descritor) vence a inferida (FR-013).
 */
export function layoutEntryOf(
    entry: InferredEntry,
    source: ResolvedSource,
    explicitVisibility: number | undefined,
): BindingLayoutEntry | string {
    const visibility = source.visibility ?? explicitVisibility ?? entry.visibility;
    const base = { binding: entry.binding, visibility };
    const r = entry.resource;
    if (r === 'uniform' || r === 'storage' || r === 'read-only-storage') {
        if (source.kind !== 'buffer') return `espera um buffer (${r}), recebeu ${source.kind}`;
        const sub = source.buffer.subkind;
        if (r === 'uniform' && sub !== 'uniform') return `binding uniform recebeu buffer '${sub}'`;
        if (r !== 'uniform' && sub === 'uniform') return `binding ${r} recebeu buffer uniform`;
        if (source.dynamic !== undefined && source.size === undefined) {
            return 'fonte com offset dinâmico sem size';
        }
        return {
            ...base,
            kind: 'buffer',
            type: r,
            ...(source.dynamic !== undefined ? { hasDynamicOffset: true } : {}),
        };
    }
    if ('sampler' in r) {
        if (source.kind !== 'sampler') return `espera um sampler, recebeu ${source.kind}`;
        return { ...base, kind: 'sampler', type: r.sampler };
    }
    if ('storageTexture' in r) {
        if (source.kind !== 'textureView')
            return `espera uma textura de storage, recebeu ${source.kind}`;
        return { ...base, kind: 'storage-texture', ...r.storageTexture };
    }
    if (source.kind !== 'textureView') return `espera uma textura, recebeu ${source.kind}`;
    const format = source.format ?? source.view.format ?? source.view.source.format;
    const isDepth = format.startsWith('depth');
    let sampleType = r.texture.sampleType;
    if (sampleType === 'depth' && !isDepth)
        return `binding de profundidade recebeu textura '${format}'`;
    if (sampleType !== 'depth' && isDepth && sampleType !== 'unfilterable-float') {
        return `binding de cor recebeu textura de profundidade '${format}'`;
    }
    if (sampleType === 'float' && UNFILTERABLE.has(format)) sampleType = 'unfilterable-float';
    // Textura multiamostrada de cor só se lê por `textureLoad`: o WebGPU exige `unfilterable-float`.
    if (sampleType === 'float' && r.texture.multisampled) sampleType = 'unfilterable-float';
    return {
        ...base,
        kind: 'texture',
        sampleType,
        viewDimension: r.texture.viewDimension,
        multisampled: r.texture.multisampled,
    };
}

/** Mesma entrada de layout? (decide se o pipeline precisa ser recriado quando a fonte muda). */
export function sameLayoutEntry(a: BindingLayoutEntry, b: BindingLayoutEntry): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
