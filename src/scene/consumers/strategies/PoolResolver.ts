import type { Schema } from '../../descriptors/Schema';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';
import type { ResolvedSource } from '../ResolvedSource';

/**
 * Fonte de um pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`): o buffer inteiro (`array<T>` no
 * shader). Registrado automaticamente pelo `ResourceSystem` ao criar o pool.
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
        return { kind: 'buffer', buffer: pool.buffer };
    }
}
