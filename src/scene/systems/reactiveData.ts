/**
 * Proxy reativo para `Resource.data` — realiza a marcação automática de sujo prevista
 * pela arquitetura ("mutação direta emite resourceDirty"). O `ResourceSystem` instala o
 * proxy quando o recurso é inserido na cena; qualquer mutação chama `onChange`.
 *
 * Rastreia:
 *   - atribuição e remoção de campos (`data.position = …`, `delete data.x`);
 *   - escrita indexada em `Array` (`data.position[0] = 5`) e seus métodos mutadores
 *     (`splice`, `fill`, `sort`, `push`, …);
 *   - objetos literais aninhados (mesmas regras, recursivamente).
 *
 * `TypedArray`/`ArrayBuffer`/`DataView` são devolvidos **crus**: são blocos de dados que
 * seguem direto para APIs nativas (`writeBuffer`, `copy`), que não aceitam Proxy. Mutar
 * um typed array no lugar não é rastreado — reatribua o campo (`data.vertices = novo`).
 *
 * Limite: referências a arrays internos capturadas **antes** da inserção (`const p =
 * t.data.position` antes de `world.insert`) apontam para o array cru e não são
 * rastreadas — mute via `t.data.position[i] = …` ou reatribua o campo.
 *
 * Proxies aninhados são criados sob demanda e cacheados: `data.position === data.position`.
 *
 * @param data - Objeto de dados do recurso.
 * @param onChange - Chamado após cada mutação com o campo de topo afetado (`data.position[0] = 5` → `'position'`;
 *   pode ser chamado várias vezes por quadro — quem consome coalesce). Um objeto aninhado alcançado por mais de um
 *   campo reporta o primeiro pelo qual foi alcançado.
 * @returns Proxy com a mesma forma de `data`.
 */
export function makeReactive<T extends object>(
    data: T,
    onChange: (field: string | undefined) => void,
): T {
    const proxies = new WeakMap<object, object>();
    const raws = new WeakMap<object, object>();
    /** Campo de topo pelo qual cada objeto aninhado foi alcançado. */
    const rootOf = new WeakMap<object, string>();

    const unwrap = (value: unknown): unknown =>
        typeof value === 'object' && value !== null ? (raws.get(value) ?? value) : value;

    const wrap = (value: unknown, root?: string): unknown => {
        if (typeof value !== 'object' || value === null) return value;
        if (root !== undefined && !rootOf.has(value)) rootOf.set(value, root);
        const cached = proxies.get(value);
        if (cached !== undefined) return cached;
        let proxy: object | undefined;
        if (Array.isArray(value)) {
            proxy = new Proxy(value, arrayHandler);
        } else if (isPlainObject(value)) {
            proxy = new Proxy(value, objectHandler);
        }
        if (proxy === undefined) return value;
        proxies.set(value, proxy);
        raws.set(proxy, value);
        return proxy;
    };

    /** Campo de topo de uma mutação em `target` (a propriedade, quando `target` é o próprio `data`). */
    const fieldOf = (target: object, prop: PropertyKey): string | undefined =>
        target === data ? (typeof prop === 'string' ? prop : undefined) : rootOf.get(target);

    const objectHandler: ProxyHandler<object> = {
        get(target, prop, receiver) {
            return wrap(Reflect.get(target, prop, receiver), fieldOf(target, prop));
        },
        set(target, prop, value) {
            const ok = Reflect.set(target, prop, unwrap(value));
            onChange(fieldOf(target, prop));
            return ok;
        },
        deleteProperty(target, prop) {
            const ok = Reflect.deleteProperty(target, prop);
            onChange(fieldOf(target, prop));
            return ok;
        },
    };

    const arrayHandler: ProxyHandler<object> = {
        get(target, prop) {
            const value: unknown = Reflect.get(target, prop, target);
            if (typeof value !== 'function') return wrap(value, rootOf.get(target));
            const fn = value as (...args: unknown[]) => unknown;
            if (!ARRAY_MUTATORS.has(prop)) return fn.bind(target);
            // Mutador executa no alvo e notifica uma vez (evita uma notificação por índice).
            return function mutate(this: unknown, ...args: unknown[]): unknown {
                const result = fn.apply(target, args.map(unwrap));
                onChange(rootOf.get(target));
                return result === target ? proxies.get(target) : result;
            };
        },
        set(target, prop, value) {
            const ok = Reflect.set(target, prop, unwrap(value), target);
            onChange(rootOf.get(target));
            return ok;
        },
        deleteProperty(target, prop) {
            const ok = Reflect.deleteProperty(target, prop);
            onChange(rootOf.get(target));
            return ok;
        },
    };

    return wrap(data) as T;
}

const ARRAY_MUTATORS: ReadonlySet<PropertyKey> = new Set([
    'copyWithin',
    'fill',
    'pop',
    'push',
    'reverse',
    'shift',
    'sort',
    'splice',
    'unshift',
]);

function isPlainObject(value: object): boolean {
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
