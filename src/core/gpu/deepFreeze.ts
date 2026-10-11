/**
 * Congela `value` em profundidade (objetos e arrays) e o devolve. Para em objetos já congelados — specs aninhadas
 * compartilhadas, já criadas, e ciclos não são revisitados — e não entra em funções (`BundleSpec.body`), que entram
 * na identidade por referência. Typed arrays não fazem parte de specs (não podem ser congelados com elementos).
 *
 * Usado por `EngineCore.create`/`createAsync`: torna executável a regra "spec é identidade imutável" — atribuir a
 * uma spec criada lança `TypeError` (módulos ESM são estritos) em vez de deixar um hash velho.
 */
export function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const key of Object.keys(value)) {
        const child = (value as Record<string, unknown>)[key];
        if (child !== null && typeof child === 'object') deepFreeze(child);
    }
    return value;
}
