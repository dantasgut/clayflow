import type { Schema } from '../../descriptors/Schema';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';
import type { ResolvedSource } from '../ResolvedSource';
import { channelSourceOf } from '../../systems/flowBinding/channelBinding';

/**
 * Fonte de um pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`): o buffer inteiro (`array<T>` no
 * shader). No pool com série temporal (descritor com `history`, spec 037), a fatia do quadro (atraso 0) pelo anel — o
 * bind group acompanha o giro; a fatia física 0 é a do quadro só em um de cada `depth` quadros. Registrado
 * automaticamente pelo `ResourceSystem` ao criar o pool.
 */
export class PoolResolver implements ConsumerResolver {
    /** Struct WGSL do elemento do pool (`schema.wgslName`). */
    readonly typeName: string;

    /**
     * @param name - Chave do pool (fornecedor `{ pool }`).
     * @param schema - Schema do elemento do pool.
     */
    constructor(
        /** Chave do pool (fornecedor `{ pool }`). */
        readonly name: string,
        private readonly schema: Schema,
    ) {
        this.typeName = schema.wgslName;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        const pool = ctx.resources.poolInfo(this.name);
        if (pool === undefined) return undefined;
        const ring = ctx.resources.channelOfPool(this.name);
        if (ring?.allocated === true) {
            return {
                kind: 'channel',
                channel: channelSourceOf(ring, `pool:${this.name}`),
                lag: 0,
                epoch: ring.epoch,
            };
        }
        // Na arena de pools (T060i), a faixa da região do pool.
        return pool.offset === 0 && pool.size === pool.buffer.byteSize
            ? { kind: 'buffer', buffer: pool.buffer }
            : { kind: 'buffer', buffer: pool.buffer, offset: pool.offset, size: pool.size };
    }
}
