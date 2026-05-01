import type { BindingEntry } from '../../../core/contracts/index';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';

export type PerEntityBindingFactory = (ctx: ResolveContext) => readonly BindingEntry[];

export class PerEntityResolver implements ConsumerResolver {
    constructor(
        readonly name: string,
        private readonly factory: PerEntityBindingFactory,
    ) {}

    resolve(ctx: ResolveContext): readonly BindingEntry[] {
        if (ctx.forEntityId === undefined) {
            throw new Error(`PerEntityResolver(${this.name}): missing forEntityId in context`);
        }
        return this.factory(ctx);
    }
}
