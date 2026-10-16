import type { NodeDefinition } from './NodeDefinition';
import { NodeGraphError } from './NodeGraphError';

/**
 * Registro de definições de nós por nome (spec 031): o que a serialização usa para reconstruir um grafo (`fromJSON`) e o
 * que uma biblioteca de nós publica. Um nome, uma definição.
 */
export class NodeRegistry {
    readonly #byName = new Map<string, NodeDefinition>();

    constructor(definitions: readonly NodeDefinition[] = []) {
        for (const d of definitions) this.register(d);
    }

    /**
     * Registra `definition`.
     *
     * @throws NodeGraphError (`node-signature`) se o nome já tem outra definição.
     */
    register(definition: NodeDefinition): void {
        const known = this.#byName.get(definition.name);
        if (known !== undefined && known !== definition) {
            throw new NodeGraphError(
                'node-signature',
                `NodeRegistry: o nó '${definition.name}' já está registrado com outra definição`,
                [definition.name],
            );
        }
        this.#byName.set(definition.name, definition);
    }

    /** A definição de nome `name`, ou `undefined`. */
    get(name: string): NodeDefinition | undefined {
        return this.#byName.get(name);
    }

    /** Nomes registrados, em ordem de registro. */
    names(): readonly string[] {
        return [...this.#byName.keys()];
    }
}
