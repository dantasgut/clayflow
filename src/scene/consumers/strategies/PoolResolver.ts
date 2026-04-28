import type { BindingEntry } from '../../../core/contracts/index';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';

export type PoolBindingFactory = (ctx: ResolveContext, poolKey: string) => readonly BindingEntry[];

export class PoolResolver implements ConsumerResolver {
    constructor(
        readonly name: string,
        private readonly poolKey: string,
        private readonly factory: PoolBindingFactory,
    ) {}

    resolve(ctx: ResolveContext): readonly BindingEntry[] {
        return this.factory(ctx, this.poolKey);
    }
}
