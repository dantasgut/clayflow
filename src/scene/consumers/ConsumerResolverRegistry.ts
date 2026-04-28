import type { BindingEntry } from '../../core/contracts/index';
import type { ConsumerResolver, ResolveContext } from './ConsumerResolver';

export class ConsumerResolverRegistry {
    private readonly map = new Map<string, ConsumerResolver>();

    register(resolver: ConsumerResolver): void {
        this.map.set(resolver.name, resolver);
    }

    has(name: string): boolean {
        return this.map.has(name);
    }

    resolve(name: string, ctx: ResolveContext): readonly BindingEntry[] {
        const resolver = this.map.get(name);
        if (resolver === undefined) {
            throw new Error(`ConsumerResolverRegistry: no resolver registered for '${name}'`);
        }
        return resolver.resolve(ctx);
    }
}
