import { describe, expect, it } from 'vitest';
import { ConsumerResolverRegistry } from '../consumers/ConsumerResolverRegistry';
import type { ConsumerResolver, ResolveContext } from '../consumers/ConsumerResolver';
import type { BindingEntry } from '../../core/contracts/index';

function stubResolver(name: string, entries: readonly BindingEntry[]): ConsumerResolver {
    return {
        name,
        resolve: (_ctx: ResolveContext) => entries,
    };
}

describe('ConsumerResolverRegistry', () => {
    it('register + has retornam consistente', () => {
        const reg = new ConsumerResolverRegistry();
        expect(reg.has('Camera')).toBe(false);
        reg.register(stubResolver('Camera', []));
        expect(reg.has('Camera')).toBe(true);
    });

    it('resolve devolve binding entries do resolver registrado', () => {
        const reg = new ConsumerResolverRegistry();
        const sentinel: BindingEntry = {
            binding: 0,
            kind: 'sampler',
            sampler: {} as never,
        };
        reg.register(stubResolver('SamplerOnly', [sentinel]));
        const ctx: ResolveContext = { world: {} as never, bindingBase: 0 };
        const out = reg.resolve('SamplerOnly', ctx);
        expect(out).toEqual([sentinel]);
    });

    it('resolve para nome não-registrado lança erro descritivo', () => {
        const reg = new ConsumerResolverRegistry();
        expect(() => reg.resolve('Unknown', { world: {} as never, bindingBase: 0 })).toThrowError(
            /no resolver registered for 'Unknown'/,
        );
    });

    it('register sobrescreve resolver com mesmo name', () => {
        const reg = new ConsumerResolverRegistry();
        const a: BindingEntry = { binding: 0, kind: 'sampler', sampler: {} as never };
        const b: BindingEntry = { binding: 1, kind: 'sampler', sampler: {} as never };
        reg.register(stubResolver('X', [a]));
        reg.register(stubResolver('X', [b]));
        const out = reg.resolve('X', { world: {} as never, bindingBase: 0 });
        expect(out).toEqual([b]);
    });
});
