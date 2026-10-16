import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';
import type { ResolvedSource } from '../ResolvedSource';

/**
 * Fonte do bitset de slots ocupados de um pool (spec 008): resolver `<chave do pool>.live`, lido como `array<u32>`
 * (um bit por slot; módulo `poolLive`). Registrado pelo `ResourceSystem` junto com o pool; o buffer é criado no
 * primeiro uso.
 */
export class PoolLiveResolver implements ConsumerResolver {
    /** Nome em `consumes`: `<chave do pool>.live`. */
    readonly name: string;
    /** Elemento do `array<u32>`. */
    readonly typeName = 'u32';

    /** @param poolKey - Chave do pool. */
    constructor(private readonly poolKey: string) {
        this.name = `${poolKey}.live`;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        const buffer = ctx.resources.poolLiveBuffer(this.poolKey);
        return buffer === undefined ? undefined : { kind: 'buffer', buffer };
    }
}
