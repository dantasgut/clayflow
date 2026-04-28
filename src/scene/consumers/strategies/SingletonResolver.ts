import type { BindingEntry } from '../../../core/contracts/index';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';

export type SingletonBindingFactory = (ctx: ResolveContext) => readonly BindingEntry[];

export class SingletonResolver implements ConsumerResolver {
    constructor(readonly name: string, private readonly factory: SingletonBindingFactory) {}

    resolve(ctx: ResolveContext): readonly BindingEntry[] {
        return this.factory(ctx);
    }
}
