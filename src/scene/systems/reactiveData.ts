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
 * @param onChange - Chamado após cada mutação (pode ser chamado várias vezes por quadro;
 *   quem consome é responsável por coalescer).
 * @returns Proxy com a mesma forma de `data`.
 */
export function makeReactive<T extends object>(data: T, onChange: () => void): T {
    const proxies = new WeakMap<object, object>();
    const raws = new WeakMap<object, object>();

    const unwrap = (value: unknown): unknown =>
        typeof value === 'object' && value !== null ? (raws.get(value) ?? value) : value;

    const wrap = (value: unknown): unknown => {
        if (typeof value !== 'object' || value === null) return value;
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

    const objectHandler: ProxyHandler<object> = {
        get(target, prop, receiver) {
            return wrap(Reflect.get(target, prop, receiver));
        },
        set(target, prop, value) {
            const ok = Reflect.set(target, prop, unwrap(value));
            onChange();
            return ok;
        },
        deleteProperty(target, prop) {
            const ok = Reflect.deleteProperty(target, prop);
            onChange();
            return ok;
        },
    };

    const arrayHandler: ProxyHandler<object> = {
        get(target, prop) {
            const value: unknown = Reflect.get(target, prop, target);
            if (typeof value !== 'function') return wrap(value);
            const fn = value as (...args: unknown[]) => unknown;
            if (!ARRAY_MUTATORS.has(prop)) return fn.bind(target);
            // Mutador executa no alvo e notifica uma vez (evita uma notificação por índice).
            return function mutate(this: unknown, ...args: unknown[]): unknown {
                const result = fn.apply(target, args.map(unwrap));
                onChange();
                return result === target ? proxies.get(target) : result;
            };
        },
        set(target, prop, value) {
            const ok = Reflect.set(target, prop, unwrap(value), target);
            onChange();
            return ok;
        },
        deleteProperty(target, prop) {
            const ok = Reflect.deleteProperty(target, prop);
            onChange();
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
