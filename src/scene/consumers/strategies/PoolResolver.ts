import type { Schema } from '../../descriptors/Schema';
import type { ConsumerResolver, ResolveContext, ResolvedSource } from '../ConsumerResolver';

/**
 * Fonte de um pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`): o buffer inteiro (`array<T>` no
 * shader) num pool de storage; num pool uniforme, um registro por offset dinâmico (`slot × stride`). Registrado
 * automaticamente pelo `ResourceSystem` ao criar o pool.
 */
export class PoolResolver implements ConsumerResolver {
    readonly typeName: string;

    constructor(
        readonly name: string,
        private readonly schema: Schema,
    ) {
        this.typeName = schema.wgslName;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        const pool = ctx.resources.poolInfo(this.name);
        if (pool === undefined) return undefined;
        if (pool.addressSpace === 'uniform') {
            return {
                kind: 'buffer',
                buffer: pool.buffer,
                size: this.schema.stride,
                dynamic: { stride: pool.stride },
            };
        }
        return { kind: 'buffer', buffer: pool.buffer };
    }
}
