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
    return new CallbackRoot(data as Record<string, unknown>, onChange).proxied as T;
}

/** Chave lida pelas traps para devolver o alvo cru de um proxy (`unwrap`), sem tabela proxy → alvo. */
const UNWRAP = Symbol('clayflow.unwrap');

/**
 * Raiz de um `data` reativo: guarda o dado cru, o proxy e o cache dos proxies aninhados, e é ela mesma o handler (as
 * traps) do proxy da raiz — além do proxy, um objeto por recurso; as traps são métodos de protótipo, sem closures, e
 * o cache só existe depois que algum campo aninhado é lido pelo proxy (spec 007, US7: um milhão de entidades).
 * Subclasses dizem o que fazer com cada mutação (`dataChanged`).
 */
export abstract class ReactiveRoot implements ProxyHandler<Record<string, unknown>> {
    /** O dado cru (o que o proxy envolve). */
    raw: Record<string, unknown>;
    /** O proxy reativo do dado. */
    proxied: Record<string, unknown>;
    /** Proxy de cada objeto aninhado já alcançado (`data.position === data.position`). */
    proxies: WeakMap<object, object> | undefined = undefined;

    constructor(data: Record<string, unknown>) {
        this.raw = data;
        this.proxied = new Proxy(data, this);
    }

    /** Uma mutação no campo de topo `field` (`undefined` = todos ou desconhecido). */
    abstract dataChanged(field: string | undefined): void;

    /** Troca o dado inteiro: proxy novo, cache dos aninhados descartado. */
    replace(next: Record<string, unknown>): void {
        this.raw = next;
        this.proxies = undefined;
        this.proxied = new Proxy(next, this);
    }

    get(target: Record<string, unknown>, prop: PropertyKey, receiver: unknown): unknown {
        if (prop === UNWRAP) return target;
        return wrap(this, Reflect.get(target, prop, receiver), this.fieldOf(target, prop));
    }

    set(target: Record<string, unknown>, prop: PropertyKey, value: unknown): boolean {
        const ok = Reflect.set(target, prop, unwrap(value));
        this.dataChanged(this.fieldOf(target, prop));
        return ok;
    }

    deleteProperty(target: Record<string, unknown>, prop: PropertyKey): boolean {
        const ok = Reflect.deleteProperty(target, prop);
        this.dataChanged(this.fieldOf(target, prop));
        return ok;
    }

    /** O campo de topo é a própria propriedade (um proxy antigo, depois de `replace`, reporta o dado inteiro). */
    private fieldOf(target: object, prop: PropertyKey): string | undefined {
        return target === this.raw && typeof prop === 'string' ? prop : undefined;
    }
}

/** Raiz que notifica uma função (`makeReactive`). */
class CallbackRoot extends ReactiveRoot {
    constructor(
        data: Record<string, unknown>,
        private readonly onChange: (field: string | undefined) => void,
    ) {
        super(data);
    }

    dataChanged(field: string | undefined): void {
        this.onChange(field);
    }
}

/** Alvo cru de um proxy reativo (para gravar o cru quando um proxy é atribuído: `a.data.p = b.data.p`). */
function unwrap(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) return value;
    return (value as { [UNWRAP]?: object })[UNWRAP] ?? value;
}

/** Proxy do valor na árvore (criado sob demanda e cacheado); `field` é o campo de topo pelo qual foi alcançado. */
function wrap(root: ReactiveRoot, value: unknown, field: string | undefined): unknown {
    if (typeof value !== 'object' || value === null) return value;
    if (value === root.raw) return root.proxied;
    const cached = root.proxies?.get(value);
    if (cached !== undefined) return cached;
    let proxy: object;
    if (Array.isArray(value)) proxy = new Proxy(value, new ArrayTraps(root, field));
    else if (isPlainObject(value)) proxy = new Proxy(value, new ObjectTraps(root, field));
    else return value;
    (root.proxies ??= new WeakMap()).set(value, proxy);
    return proxy;
}

/** Traps de objeto aninhado: o estado (raiz e campo de topo) fica no próprio handler (`this` das traps). */
class ObjectTraps implements ProxyHandler<object> {
    constructor(
        private readonly root: ReactiveRoot,
        private readonly field: string | undefined,
    ) {}

    get(target: object, prop: PropertyKey, receiver: unknown): unknown {
        if (prop === UNWRAP) return target;
        return wrap(this.root, Reflect.get(target, prop, receiver), this.field);
    }

    set(target: object, prop: PropertyKey, value: unknown): boolean {
        const ok = Reflect.set(target, prop, unwrap(value));
        this.root.dataChanged(this.field);
        return ok;
    }

    deleteProperty(target: object, prop: PropertyKey): boolean {
        const ok = Reflect.deleteProperty(target, prop);
        this.root.dataChanged(this.field);
        return ok;
    }
}

/** Traps de array: escrita indexada e métodos mutadores notificam o campo de topo. */
class ArrayTraps implements ProxyHandler<object> {
    constructor(
        private readonly root: ReactiveRoot,
        private readonly field: string | undefined,
    ) {}

    get(target: object, prop: PropertyKey): unknown {
        if (prop === UNWRAP) return target;
        const value: unknown = Reflect.get(target, prop, target);
        if (typeof value !== 'function') return wrap(this.root, value, this.field);
        const fn = value as (...args: unknown[]) => unknown;
        if (!ARRAY_MUTATORS.has(prop)) return fn.bind(target);
        // Mutador executa no alvo e notifica uma vez (evita uma notificação por índice).
        const root = this.root;
        const field = this.field;
        return function mutate(this: unknown, ...args: unknown[]): unknown {
            const result = fn.apply(target, args.map(unwrap));
            root.dataChanged(field);
            return result === target ? root.proxies?.get(target) : result;
        };
    }

    set(target: object, prop: PropertyKey, value: unknown): boolean {
        const ok = Reflect.set(target, prop, unwrap(value), target);
        this.root.dataChanged(this.field);
        return ok;
    }

    deleteProperty(target: object, prop: PropertyKey): boolean {
        const ok = Reflect.deleteProperty(target, prop);
        this.root.dataChanged(this.field);
        return ok;
    }
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
