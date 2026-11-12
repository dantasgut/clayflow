import type { ConsumerResolver, ResolveContext } from '../../../scene/consumers/ConsumerResolver';
import type { ResolvedSource } from '../../../scene/consumers/ResolvedSource';
import { sourceOfDescriptor } from '../../../scene/consumers/strategies/sourceOfDescriptor';
import { VirtualTextures } from './VirtualTextures';

/**
 * Fonte de um descritor das `VirtualTextures` da cena (spec 034, T060c) para o nó `nodes.image.virtual`: os cabeçalhos e
 * a tabela (`words`), o atlas (a série por páginas: o alvo), o amostrador e os pedidos — a fatia atual da série de buffer
 * (pelo anel: o ligamento acompanha o giro, a cada quadro a fatia que o `VirtualTextureFlow` zerou).
 */
export class VirtualTexturesResolver implements ConsumerResolver {
    readonly name: string;

    constructor(
        private readonly descId: 'words' | 'requests' | 'atlas' | 'sampler',
        /** Tipo WGSL do binding. */
        readonly typeName: string,
    ) {
        this.name = `VirtualTextures.${descId}`;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        for (const id of ctx.world.queryBySchemaName(VirtualTextures.schema.name)) {
            const cache = ctx.world.resourcesOf(id).find((r) => r instanceof VirtualTextures);
            if (cache === undefined) continue;
            return sourceOfDescriptor(ctx.resources, cache, this.descId);
        }
        return undefined;
    }
}
