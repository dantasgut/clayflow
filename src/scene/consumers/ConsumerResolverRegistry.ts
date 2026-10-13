import type { ConsumerResolver, ResolveContext, ResolvedSource } from './ConsumerResolver';

/** Erro de resolução: nome de `consumes` sem resolver registrado. */
export class ConsumerResolutionError extends Error {
    /** Nome do erro (`'ConsumerResolutionError'`). */
    override readonly name = 'ConsumerResolutionError';
}

/**
 * Registro dos resolvers de `consumes` de uma cena. Um resolver por nome; `register` de um nome existente substitui
 * (aplicações podem trocar o padrão), `registerDefault` não substitui (usado pela C2 ao criar pools).
 */
export class ConsumerResolverRegistry {
    private readonly map = new Map<string, ConsumerResolver>();

    /** Registra (ou substitui) o resolver de `resolver.name`. */
    register(resolver: ConsumerResolver): void {
        this.map.set(resolver.name, resolver);
    }

    /** Registra só se ainda não há resolver com o nome; devolve se registrou. */
    registerDefault(resolver: ConsumerResolver): boolean {
        if (this.map.has(resolver.name)) return false;
        this.map.set(resolver.name, resolver);
        return true;
    }

    /** Há resolver para o nome? */
    has(name: string): boolean {
        return this.map.has(name);
    }

    /** Resolver do nome, ou `undefined`. */
    get(name: string): ConsumerResolver | undefined {
        return this.map.get(name);
    }

    /** Nomes registrados, em ordem de registro (mensagens de erro). */
    names(): readonly string[] {
        return [...this.map.keys()];
    }

    /**
     * Fonte atual do nome.
     * @throws ConsumerResolutionError se o nome não tem resolver (a mensagem lista os disponíveis).
     */
    resolve(name: string, ctx: ResolveContext): ResolvedSource | undefined {
        const resolver = this.map.get(name);
        if (resolver === undefined) {
            throw new ConsumerResolutionError(
                `ConsumerResolverRegistry: nenhum resolver para '${name}' (disponíveis: ${this.names().join(', ') || 'nenhum'}).`,
            );
        }
        return resolver.resolve(ctx);
    }
}
