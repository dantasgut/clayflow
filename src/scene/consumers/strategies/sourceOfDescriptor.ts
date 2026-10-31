import type { Resource } from '../../contracts/Resource';
import type { ResourceDirectory } from '../../contracts/ResourceDirectory';
import type { ResolvedSource } from '../ResolvedSource';

/** Fonte do que a C2 alocou para o descritor `descId` de `resource` (buffer, view ou sampler), com a visibilidade explícita do descritor. */
export function sourceOfDescriptor(
    resources: ResourceDirectory,
    resource: Resource,
    descId: string,
): ResolvedSource | undefined {
    const desc = resource.getDescriptors().find((d) => d.id === descId);
    const visibility = desc?.visibility !== undefined ? { visibility: desc.visibility } : {};
    const buffer = resources.bufferOf(resource, descId);
    if (buffer !== undefined && buffer.subkind !== 'staging') {
        const stride =
            desc?.regions !== undefined ? resources.regionStrideOf(resource, descId) : undefined;
        if (stride !== undefined && desc?.schema !== undefined) {
            return {
                kind: 'buffer',
                buffer,
                size: desc.schema.stride,
                dynamic: { stride },
                ...visibility,
            };
        }
        return { kind: 'buffer', buffer, ...visibility };
    }
    const view = resources.textureViewOf(resource, descId);
    if (view !== undefined) {
        const format = resources.textureOf(resource, descId)?.format;
        return {
            kind: 'textureView',
            view,
            ...(format !== undefined ? { format } : {}),
            ...visibility,
        };
    }
    const sampler = resources.samplerOf(resource, descId);
    if (sampler !== undefined) return { kind: 'sampler', sampler, ...visibility };
    return undefined;
}
