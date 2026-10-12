import type {
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
    StorageBufferSpec,
    AnyBufferSpec,
    SamplerSpec,
} from '../../core/contracts/index';
import type { Resource } from '../contracts/Resource';
import type { Schema } from '../descriptors/Schema';
import type { EntityId } from '../world/EntityId';

/** Classe de um Resource (reconhecida por `instanceof`, que sobrevive à minificação). */
export type ResourceType<T extends Resource = Resource> = abstract new (...args: never[]) => T;

/** Pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`). */
export interface PoolSlot<O extends boolean = boolean> {
    readonly kind: 'pool';
    readonly poolKey: string;
    /** Opcional: o Flow fica pronto sem o pool (resolvido como `undefined`). */
    readonly optional: O;
}

/** O pool do `bodyType` da instância (registro com `bodyType`). Obrigatório. */
export interface BodiesSlot {
    readonly kind: 'bodies';
}

/** Conjunto de pools; cada um resolvido como o pool ou `undefined` (ainda vazio). Sempre resolvido. */
export interface PoolsSlot {
    readonly kind: 'pools';
    readonly poolKeys: readonly string[];
}

/** O primeiro Resource com `schema` que continua na cena (e passa em `select`). */
export interface SingletonSlot<O extends boolean = boolean> {
    readonly kind: 'singleton';
    readonly schema: Schema;
    readonly optional: O;
    readonly select?: (resource: Resource) => boolean;
}

/** Entidades que têm um Resource de cada tipo de `all`, mantidas pela C2 na inserção e na remoção. */
export interface EntitiesSlot<T extends readonly ResourceType[] = readonly ResourceType[]> {
    readonly kind: 'entities';
    readonly all: T;
}

/** Textura (e view) alocada pela C2 para o descritor `descId` do primeiro Resource com `schema`. */
export interface TextureSlot<O extends boolean = boolean> {
    readonly kind: 'texture';
    readonly schema: Schema;
    readonly descId: string;
    readonly optional: O;
    readonly select?: (resource: Resource) => boolean;
}

/** Textura de um Resource: `schema` + `descId` do descritor de textura. */
export interface TextureRef {
    readonly schema: Schema;
    readonly descId: string;
    readonly select?: (resource: Resource) => boolean;
}

/**
 * Alvo de render: a cor no canvas do quadro, na textura de um Resource, ou nenhuma (`'none'`, passe só de
 * profundidade — ex.: sombra), com profundidade opcional de um Resource.
 */
export interface TargetSlot {
    readonly kind: 'target';
    readonly color: 'canvas' | 'none' | TextureRef;
    readonly depth?: TextureRef;
}

/** Declaração de um slot (valor imutável criado por `slot.*`). */
export type SlotDeclaration =
    | PoolSlot
    | BodiesSlot
    | PoolsSlot
    | SingletonSlot
    | EntitiesSlot
    | TextureSlot
    | TargetSlot;

/** Slots de um Flow, por nome. */
export type SlotMap = Readonly<Record<string, SlotDeclaration>>;

/** Pool resolvido. Visão viva: contagem, buffer e geração acompanham a C2. */
export interface BoundPool {
    readonly poolKey: string;
    readonly schema: Schema;
    /** Buffer atual do pool (storage, ou uniform num pool de uniforms). */
    readonly buffer: StorageBufferSpec | UniformBufferSpec;
    /** Slots ocupáveis (maior slot já usado + 1). */
    readonly count: number;
    /** Bytes por registro. */
    readonly stride: number;
    readonly capacity: number;
    /** Incrementa a cada recriação do buffer. */
    readonly generation: number;
    /** Slot da entidade no pool, ou `undefined`. */
    slotOf(entityId: EntityId): number | undefined;
    /** Entidade que ocupa o slot, ou `undefined`. */
    entityAt(slot: number): EntityId | undefined;
}

/** Resource único resolvido e o que a C2 alocou para ele. */
export interface BoundSingleton<R extends Resource = Resource> {
    readonly resource: R;
    /** Buffer alocado para o descritor `descId` do recurso. */
    bufferOf(descId: string): AnyBufferSpec | undefined;
    textureViewOf(descId: string): TextureViewSpec | undefined;
    samplerOf(descId: string): SamplerSpec | undefined;
}

/** Entidade de um slot `entities`, com os Resources dos tipos pedidos. */
export interface EntityEntry {
    readonly entityId: EntityId;
    /** Todos os Resources da entidade. */
    readonly resources: readonly Resource[];
    /** O Resource da entidade que é instância de `type` (um dos tipos de `all`). */
    get<T extends Resource>(type: ResourceType<T>): T;
}

/** Conjunto de entidades resolvido, em ordem de inserção. */
export interface BoundEntities {
    readonly entries: readonly EntityEntry[];
    /** Entrada da entidade, ou `undefined`. */
    entry(entityId: EntityId): EntityEntry | undefined;
}

/** Textura resolvida. */
export interface BoundTexture {
    readonly texture: TextureSpec;
    readonly view: TextureViewSpec;
}

/** Alvo resolvido. `color: 'canvas'` → `frame.canvasView` no `dispatch`; `'none'` → sem anexo de cor. */
export interface BoundTarget {
    readonly color: 'canvas' | 'none' | TextureViewSpec;
    /** Formato de cor do alvo (o do canvas ou o da textura); ausente sem cor. */
    readonly format?: GPUTextureFormat;
    readonly depth?: TextureViewSpec;
    readonly depthFormat?: GPUTextureFormat;
}

/** Tipo resolvido de cada declaração. */
export type BoundSlot<D extends SlotDeclaration> =
    D extends PoolSlot<infer O>
        ? O extends true
            ? BoundPool | undefined
            : BoundPool
        : D extends BodiesSlot
          ? BoundPool
          : D extends PoolsSlot
            ? ReadonlyMap<string, BoundPool | undefined>
            : D extends SingletonSlot<infer O>
              ? O extends true
                  ? BoundSingleton | undefined
                  : BoundSingleton
              : D extends EntitiesSlot
                ? BoundEntities
                : D extends TextureSlot<infer O>
                  ? O extends true
                      ? BoundTexture | undefined
                      : BoundTexture
                  : D extends TargetSlot
                    ? BoundTarget
                    : never;

/** Slots resolvidos de um Flow. */
export type BoundSlots<TSlots extends SlotMap> = {
    readonly [K in keyof TSlots]: BoundSlot<TSlots[K]>;
};

/**
 * Construtores de slots. Um slot é a declaração tipada de um dado que o Flow consome; a Camada 2 o resolve, o mantém
 * atualizado e o entrega ao `dispatch` (`bound.slots`). Slots obrigatórios não resolvidos mantêm o Flow pendente.
 */
export const slot = {
    /** Pool da C2 pela chave. */
    pool<O extends boolean = false>(
        poolKey: string,
        opts?: { readonly optional?: O },
    ): PoolSlot<O> {
        return Object.freeze({ kind: 'pool', poolKey, optional: (opts?.optional ?? false) as O });
    },
    /** O pool de corpos do `bodyType` da instância. */
    bodies(): BodiesSlot {
        return Object.freeze({ kind: 'bodies' });
    },
    /** Conjunto de pools (ex.: colliders); pools ainda inexistentes resolvem como `undefined`. */
    pools(poolKeys: readonly string[]): PoolsSlot {
        return Object.freeze({ kind: 'pools', poolKeys: Object.freeze([...poolKeys]) });
    },
    /** O primeiro Resource com `schema` na cena (ex.: câmera ativa, `Time`). */
    singleton<O extends boolean = false>(
        schema: Schema,
        opts?: { readonly optional?: O; readonly select?: (resource: Resource) => boolean },
    ): SingletonSlot<O> {
        return Object.freeze({
            kind: 'singleton',
            schema,
            optional: (opts?.optional ?? false) as O,
            ...(opts?.select !== undefined ? { select: opts.select } : {}),
        });
    },
    /** Entidades com um Resource de cada tipo de `all` (ex.: geometria + material + transform). */
    entities<T extends readonly ResourceType[]>(opts: { readonly all: T }): EntitiesSlot<T> {
        return Object.freeze({
            kind: 'entities',
            all: Object.freeze([...opts.all]) as unknown as T,
        });
    },
    /** Textura alocada para o descritor `descId` do primeiro Resource com `schema`. */
    texture<O extends boolean = false>(
        schema: Schema,
        descId: string,
        opts?: { readonly optional?: O; readonly select?: (resource: Resource) => boolean },
    ): TextureSlot<O> {
        return Object.freeze({
            kind: 'texture',
            schema,
            descId,
            optional: (opts?.optional ?? false) as O,
            ...(opts?.select !== undefined ? { select: opts.select } : {}),
        });
    },
    /**
     * Alvo de render: a cor no canvas do quadro (`'canvas'`) ou na textura de um Resource, com profundidade opcional
     * de um Resource (ex.: `{ color: 'canvas', depth: { schema: FrameTargets.schema, descId: 'depth' } }`).
     */
    target(
        target:
            | 'canvas'
            | { readonly color: 'canvas' | 'none' | TextureRef; readonly depth?: TextureRef },
    ): TargetSlot {
        if (target === 'canvas') return Object.freeze({ kind: 'target', color: 'canvas' });
        return Object.freeze({
            kind: 'target',
            color: target.color,
            ...(target.depth !== undefined ? { depth: target.depth } : {}),
        });
    },
} as const;
