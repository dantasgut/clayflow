/**
 * Proxy reativo para `Resource.data` — realiza a marcação automática de sujo prevista
 * pela arquitetura ("mutação direta emite resourceDirty"). O `ResourceSystem` instala o
 * proxy quando o recurso é inserido na cena; qualquer mutação chama `onChange`.
 *
 * Rastreia:
 *   - atribuição e remoção de campos (`data.position = …`, `delete data.x`);
 *   - escrita indexada em `Array` e `TypedArray` (`data.position[0] = 5`);
 *   - métodos mutadores de `Array`/`TypedArray` (`set`, `fill`, `splice`, `sort`, …);
 *   - objetos literais aninhados (mesmas regras, recursivamente).
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
            proxy = new Proxy(value, sequenceHandler(ARRAY_MUTATORS));
        } else if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
            proxy = new Proxy(value, sequenceHandler(TYPED_ARRAY_MUTATORS));
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

    function sequenceHandler(mutators: ReadonlySet<PropertyKey>): ProxyHandler<object> {
        return {
            get(target, prop) {
                // Receiver = alvo: getters nativos de TypedArray (length, byteLength…) exigem
                // `this` real; métodos são ligados ao alvo pelo mesmo motivo.
                const value: unknown = Reflect.get(target, prop, target);
                if (typeof value !== 'function') return wrap(value);
                const fn = value as (...args: unknown[]) => unknown;
                if (!mutators.has(prop)) return fn.bind(target);
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
    }

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

const TYPED_ARRAY_MUTATORS: ReadonlySet<PropertyKey> = new Set([
    'copyWithin',
    'fill',
    'reverse',
    'set',
    'sort',
]);

function isPlainObject(value: object): boolean {
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
