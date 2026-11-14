import type { Resource } from '../../contracts/Resource';
import type { ResourceDirectory } from '../../contracts/ResourceDirectory';
import type { ResolvedSource } from '../ResolvedSource';
import { channelSourceOf } from '../../systems/flowBinding/channelBinding';

/**
 * Fonte do que a C2 alocou para o descritor `descId` de `resource` (buffer, view ou sampler), com a visibilidade
 * explícita do descritor. Descritor de textura com série temporal (spec 037): a fatia atual (atraso 0) pelo anel — o
 * bind group acompanha o giro.
 */
export function sourceOfDescriptor(
    resources: ResourceDirectory,
    resource: Resource,
    descId: string,
): ResolvedSource | undefined {
    const desc = resource.getDescriptors().find((d) => d.id === descId);
    const visibility = desc?.visibility !== undefined ? { visibility: desc.visibility } : {};
    // Série de buffer de fatias (spec 037; ex.: os pedidos das texturas virtuais, spec 034 T060c): a fatia atual pelo
    // anel, não a primeira fatia alocada.
    const ring =
        desc?.history !== undefined && desc.history.pages === undefined
            ? resources.channelOf(resource, descId)
            : undefined;
    if (ring?.allocated === true && desc?.textureShape === undefined) {
        return {
            kind: 'channel',
            channel: channelSourceOf(ring, `${resource.constructor.name}.${descId}`),
            lag: 0,
            epoch: ring.epoch,
            ...visibility,
        };
    }
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
    const channel = desc?.history !== undefined ? resources.channelOf(resource, descId) : undefined;
    if (channel?.allocated === true && buffer === undefined) {
        return {
            kind: 'channel',
            channel: channelSourceOf(channel, `${resource.constructor.name}.${descId}`),
            lag: 0,
            epoch: channel.epoch,
            ...visibility,
        };
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
