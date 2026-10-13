/**
 * Gancho da C2 no `data` de uma Entity inserida numa cena (interno do motor): a C2 põe aqui o estado reativo do
 * recurso, e o acessor `data` passa a devolver o proxy e a tratar a reatribuição.
 * @internal
 */
export const DATA_HOOK = Symbol('clayflow.dataHook');

/**
 * O que o acessor `data` usa do gancho da C2.
 * @internal
 */
export interface DataHook {
    /** O dado cru (o que o proxy envolve). */
    readonly raw: Record<string, unknown>;
    /** Proxy reativo do dado. */
    readonly proxied: Record<string, unknown>;
    /** Troca o dado inteiro (`resource.data = novo`). */
    replace(next: Record<string, unknown>): void;
    /** Avisa a mutação de um campo de topo (`undefined` = o dado inteiro). */
    dataChanged(field: string | undefined): void;
}

/**
 * World onde a Entity está inserida e o EntityId da raiz que a contém (mantidos pelo World; internos do motor).
 * @internal
 */
export const WORLD_OWNER = Symbol('clayflow.worldOwner');
/** @internal */
export const WORLD_ENTITY = Symbol('clayflow.worldEntity');

/**
 * Entity é a unidade composicional da Camada 2 (Sync) — qualquer objeto
 * inserido em `World` herda de Entity. A composição é via `add(child)`:
 * uma Entity-pai agrega Entity-filhas em uma árvore plana, e
 * `World.insert(root)` percorre a árvore registrando cada filho como
 * `Resource` indexável.
 *
 * Padrão de uso típico:
 * ```ts
 * const box = new BoxGeometry({ size: [1, 1, 1] });
 * box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1] }));
 * box.add(new Transform({ position: [0, 0, 0, 1] }));
 * world.insert(box);  // registra geometria + material + transform
 * ```
 *
 * Subclasses concretas (Camera, Transform, BoxGeometry, etc.) implementam
 * `Resource` (descritores GPU), enquanto Entity provê a hierarquia e o `data`
 * do Resource: um acessor no protótipo — subclasses atribuem `this.data = …` no
 * construtor e **não** declaram o campo `data` (spec 007). Na cena, a C2 liga o
 * acessor ao proxy reativo (mutação de campo e reatribuição inteira marcam o
 * recurso) sem redefinir propriedades na instância: o objeto mantém a forma da
 * classe (um milhão de entidades sem objetos em modo dicionário).
 * Entity é abstrata — não pode ser instanciada diretamente.
 */
export abstract class Entity {
    /**
     * Filhos da entidade. Privado — manipulado apenas via `add()` para
     * preservar o invariante "uma Entity tem um único pai" (não validado
     * em runtime, mas convenção do projeto).
     */
    private readonly parts: Entity[] = [];

    /** Dado cru fora da cena (antes da inserção). */
    #data: Record<string, unknown> = {};

    /**
     * Estado reativo posto pela C2 na inserção.
     * @internal
     */
    [DATA_HOOK]: DataHook | undefined = undefined;

    /**
     * World onde está inserida (`undefined` fora de cena) — campo da instância, sem tabela por recurso no World.
     * @internal
     */
    [WORLD_OWNER]: object | undefined = undefined;

    /**
     * EntityId da raiz que a contém nesse World.
     * @internal
     */
    [WORLD_ENTITY] = -1;

    /**
     * Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
     * `data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.
     */
    get data(): Record<string, unknown> {
        const hook = this[DATA_HOOK];
        return hook === undefined ? this.#data : hook.proxied;
    }

    /** Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio. */
    set data(next: Record<string, unknown>) {
        const hook = this[DATA_HOOK];
        if (hook === undefined) {
            this.#data = next;
            return;
        }
        hook.replace(next);
        hook.dataChanged(undefined);
    }

    /**
     * O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
     * estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.
     */
    protected get rawData(): Readonly<Record<string, unknown>> {
        return this[DATA_HOOK]?.raw ?? this.#data;
    }

    /**
     * Anexa uma Entity-filha. Retorna `this` para chaining fluente.
     * Não valida ciclos nem múltiplos pais — responsabilidade do caller.
     */
    add(e: Entity): this {
        this.parts.push(e);
        return this;
    }

    /**
     * Lista somente-leitura dos filhos diretos. World.insert traverse essa
     * árvore recursivamente para coletar todos os Resources de um root.
     */
    get attached(): readonly Entity[] {
        return this.parts;
    }
}
