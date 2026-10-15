import type {
    TextureSpec,
    TextureViewSpec,
    StorageBufferSpec,
    AnyBufferSpec,
    SamplerSpec,
} from '../../core/contracts/index';
import type { Resource } from '../contracts/Resource';
import type { Schema } from '../descriptors/Schema';
import type { StructSchema } from '../descriptors/StructSchema';
import type { EntityId } from '../world/EntityId';

/** Classe de um Resource (reconhecida por `instanceof`, que sobrevive à minificação). */
export type ResourceType<T extends Resource = Resource> = abstract new (...args: never[]) => T;

/** Pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`). */
export interface PoolSlot<O extends boolean = boolean> {
    /** Tipo do slot. */
    readonly kind: 'pool';
    /** Chave do pool. */
    readonly poolKey: string;
    /** Opcional: o Flow fica pronto sem o pool (resolvido como `undefined`). */
    readonly optional: O;
}

/** O pool do `bodyType` da instância (registro com `bodyType`). Obrigatório. */
export interface BodiesSlot {
    /** Tipo do slot. */
    readonly kind: 'bodies';
}

/** Conjunto de pools; cada um resolvido como o pool ou `undefined` (ainda vazio). Sempre resolvido. */
export interface PoolsSlot {
    /** Tipo do slot. */
    readonly kind: 'pools';
    /** Chaves dos pools. */
    readonly poolKeys: readonly string[];
}

/** O primeiro Resource com `schema` que continua na cena (e passa em `select`). */
export interface SingletonSlot<O extends boolean = boolean> {
    /** Tipo do slot. */
    readonly kind: 'singleton';
    /** Schema do Resource. */
    readonly schema: Schema;
    /** Opcional: o Flow fica pronto sem o Resource (resolvido como `undefined`). */
    readonly optional: O;
    /** Filtro do Resource (padrão: o primeiro com o schema). */
    readonly select?: (resource: Resource) => boolean;
}

/**
 * Registro de GPU por entidade de um conjunto `entities`, mantido pela C2 num pool com chave `schema.name`. Cada campo
 * (`u32` no schema) recebe o slot de pool do descritor `descId` do Resource da entidade que é instância do tipo dado —
 * ex.: `Renderable` = `{ transformSlot: [Transform, 'world'], materialSlot: [Material, 'material'] }`. Conjuntos com a
 * mesma declaração compartilham o pool e o slot; estágios só leem.
 */
export interface EntityRecordDeclaration {
    /** Schema do registro (um campo `u32` por entrada de `fields`); o nome é a chave do pool. */
    readonly schema: StructSchema;
    /**
     * Campo → [classe do Resource da entidade, id do descritor em pool cujo slot vai no campo]. Com o terceiro
     * elemento `{ optional: true }`, o tipo não precisa estar em `all`: entidade sem o Resource — ou com o Resource sem
     * o descritor (spec 010) — tem `RECORD_NONE` no campo (spec 009 — ex.: o registro da função `material` da entidade,
     * quando há; a geometria diferencial da superfície, quando ela a declara).
     */
    readonly fields: Readonly<
        Record<string, readonly [ResourceType, string, { readonly optional: true }?]>
    >;
}

/** Valor de um campo opcional de registro de entidade sem o Resource (`0xFFFFFFFF`). */
export const RECORD_NONE = 0xffffffff;

/**
 * Grupos de instâncias de um conjunto `entities` (spec 007): a C2 agrupa as entradas pela chave que o estágio dá (ex.:
 * geometria + pipeline) e mantém na GPU a lista de instâncias de cada grupo — um segmento contíguo de um pool com chave
 * `schema.name`, um `u32` por instância. O estágio desenha um grupo com uma chamada (`first`, `count`) e o shader acha a
 * entidade por `lista[instance_index]`. A composição muda só por eventos (inserção, remoção, envio de um Resource da
 * entidade); com a cena parada nada é percorrido.
 */
export interface EntityGroupsDeclaration {
    /** Schema da lista de instâncias (um único campo `u32`); o nome é a chave do pool lido pelo shader. */
    readonly schema: StructSchema;
    /** Chave do grupo da entrada. Reavaliada na inserção e quando um Resource da entidade é enviado. */
    readonly key: (entry: EntityEntry) => string;
    /** Valor por instância: o slot do registro do conjunto (`'record'`) ou o slot de pool do descritor nomeado. */
    readonly instance: 'record' | readonly [ResourceType, string];
    /**
     * Campos que podem mudar a chave, por schema do pool (ex.: `{ Transform: ['scale'] }`): o envio de um pool listado
     * só reavalia as chaves quando um desses campos mudou. Pools fora do mapa reavaliam a cada envio.
     */
    readonly rekeyOn?: Readonly<Record<string, readonly string[]>>;
}

/** Grupo de instâncias resolvido: um desenho com `count` instâncias a partir de `first` na lista. */
export interface DrawGroup {
    /** Chave do grupo (a da declaração). */
    readonly key: string;
    /** Primeira posição do grupo na lista de instâncias (o `firstInstance` do desenho). */
    readonly first: number;
    /** Instâncias do grupo. */
    readonly count: number;
    /** Uma entrada do grupo (para os dados comuns a todas: geometria, pipeline). */
    readonly representative: EntityEntry;
}

/** Entidades que têm um Resource de cada tipo de `all`, mantidas pela C2 na inserção e na remoção. */
export interface EntitiesSlot<T extends readonly ResourceType[] = readonly ResourceType[]> {
    /** Tipo do slot. */
    readonly kind: 'entities';
    /** Classes de Resource que a entidade precisa ter (todas). */
    readonly all: T;
    /** Registro de GPU por entidade, mantido pela C2 (opcional). */
    readonly record?: EntityRecordDeclaration;
    /** Grupos de instâncias, mantidos pela C2 (opcional). */
    readonly groups?: EntityGroupsDeclaration;
    /**
     * Descritores cujo dado passa a ser da GPU para as entidades do conjunto. Em pool (spec 007): depois do primeiro
     * envio a CPU não os envia mais e mutação em `data` é ignorada com aviso — ex.: a física escreve a pose no
     * `Transform` dos corpos. Individual (spec 008): o conjunto é o escritor declarado de um dado `upload: 'never'`
     * (ex.: os vértices de uma geometria escrita por um kernel; `hasGpuWriter`).
     */
    readonly owns?: readonly (readonly [ResourceType, string])[];
}

/** Textura (e view) alocada pela C2 para o descritor `descId` do primeiro Resource com `schema`. */
export interface TextureSlot<O extends boolean = boolean> {
    /** Tipo do slot. */
    readonly kind: 'texture';
    /** Schema do Resource dono da textura. */
    readonly schema: Schema;
    /** Id do descritor de textura no Resource. */
    readonly descId: string;
    /** Opcional: o Flow fica pronto sem a textura (resolvida como `undefined`). */
    readonly optional: O;
    /** Filtro do Resource (padrão: o primeiro com o schema). */
    readonly select?: (resource: Resource) => boolean;
}

/** Textura de um Resource: `schema` + `descId` do descritor de textura. */
export interface TextureRef {
    /** Schema do Resource dono da textura. */
    readonly schema: Schema;
    /** Id do descritor de textura no Resource. */
    readonly descId: string;
    /** Filtro do Resource (padrão: o primeiro com o schema). */
    readonly select?: (resource: Resource) => boolean;
}

/**
 * Alvo de render: a cor no canvas do quadro, na textura de um Resource, ou nenhuma (`'none'`, passe só de
 * profundidade — ex.: sombra), com profundidade opcional de um Resource.
 */
export interface TargetSlot {
    /** Tipo do slot. */
    readonly kind: 'target';
    /** Cor: o canvas do quadro, nenhuma, ou a textura de um Resource. */
    readonly color: 'canvas' | 'none' | TextureRef;
    /** Profundidade: a textura de um Resource (opcional). */
    readonly depth?: TextureRef;
    /**
     * Cor multiamostrada (spec 008, MSAA): a textura de amostras de um Resource, opcional — quando o Resource a declara,
     * o passe desenha nela e resolve na `color`; sem ela, desenha direto na `color`.
     */
    readonly samples?: TextureRef;
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
    /** Chave do pool. */
    readonly poolKey: string;
    /** Schema do elemento do pool. */
    readonly schema: Schema;
    /** Buffer atual do pool (storage, `array<T>` no shader). */
    readonly buffer: StorageBufferSpec;
    /** Slots ocupáveis (maior slot já usado + 1). */
    readonly count: number;
    /** Bytes por registro. */
    readonly stride: number;
    /** Registros que cabem no buffer atual (cresce por realocação). */
    readonly capacity: number;
    /** Incrementa a cada recriação do buffer. */
    readonly generation: number;
    /** Slots de posse da GPU (escritos por um estágio, não pela CPU). */
    readonly gpuOwned: number;
    /**
     * Bitset de slots ocupados na GPU (`array<u32>`, um bit por slot; spec 008) — o que um kernel que percorre
     * `[0, count)` testa para ignorar faixas liberadas (`pool_live`). Também em `consumes` como `<poolKey>.live`.
     */
    readonly live: StorageBufferSpec;
    /** Slot da entidade no pool (o primeiro da faixa), ou `undefined`. */
    slotOf(entityId: EntityId): number | undefined;
    /** Faixa da entidade no pool (`count` slots contíguos a partir de `first`, spec 008), ou `undefined`. */
    rangeOf(entityId: EntityId):
        | {
              /** Primeiro slot da faixa. */
              readonly first: number;
              /** Slots da faixa. */
              readonly count: number;
          }
        | undefined;
    /** O slot é de posse da GPU (escrito por um estágio, não pela CPU)? */
    ownedByGpu(slot: number): boolean;
    /** Entidade que ocupa o slot, ou `undefined`. */
    entityAt(slot: number): EntityId | undefined;
}

/** Resource único resolvido e o que a C2 alocou para ele. */
export interface BoundSingleton<R extends Resource = Resource> {
    /** O Resource resolvido. */
    readonly resource: R;
    /** Buffer alocado para o descritor `descId` do recurso. */
    bufferOf(descId: string): AnyBufferSpec | undefined;
    /** View alocada para o descritor de textura `descId` do recurso. */
    textureViewOf(descId: string): TextureViewSpec | undefined;
    /** Sampler alocado para o descritor `descId` do recurso. */
    samplerOf(descId: string): SamplerSpec | undefined;
}

/** Entidade de um slot `entities`, com os Resources dos tipos pedidos. */
export interface EntityEntry {
    /** Id da entidade. */
    readonly entityId: EntityId;
    /** Todos os Resources da entidade. */
    readonly resources: readonly Resource[];
    /** O Resource da entidade que é instância de `type` (um dos tipos de `all`). */
    get<T extends Resource>(type: ResourceType<T>): T;
    /**
     * Slot do registro da entidade no pool do `record` do slot (o `firstInstance` do desenho), ou `undefined` sem
     * `record` ou quando algum campo não tem slot (ex.: descritor fora de pool).
     */
    readonly recordSlot: number | undefined;
}

/** Conjunto de entidades resolvido, em ordem de inserção. */
export interface BoundEntities {
    /** Entradas, em ordem de inserção. */
    readonly entries: readonly EntityEntry[];
    /** Entrada da entidade, ou `undefined`. */
    entry(entityId: EntityId): EntityEntry | undefined;
    /** Pool dos registros, quando o slot declara `record` (visão viva, como `slot.pool`). */
    readonly records: BoundPool | undefined;
    /** Grupos não vazios, em ordem de criação, quando o slot declara `groups`; senão vazio. */
    readonly groups: readonly DrawGroup[];
    /** Pool da lista de instâncias, quando o slot declara `groups` (visão viva). */
    readonly instances: BoundPool | undefined;
}

/** Textura resolvida. */
export interface BoundTexture {
    /** A textura. */
    readonly texture: TextureSpec;
    /** A view da textura. */
    readonly view: TextureViewSpec;
}

/** Alvo resolvido. `color: 'canvas'` → `frame.canvasView` no `dispatch`; `'none'` → sem anexo de cor. */
export interface BoundTarget {
    /** Cor: o canvas do quadro, nenhuma, ou a view da textura. */
    readonly color: 'canvas' | 'none' | TextureViewSpec;
    /** Formato de cor do alvo (o do canvas ou o da textura); ausente sem cor. */
    readonly format?: GPUTextureFormat;
    /** View de profundidade, quando o alvo tem. */
    readonly depth?: TextureViewSpec;
    /** Formato da profundidade, quando o alvo tem. */
    readonly depthFormat?: GPUTextureFormat;
    /** View da cor multiamostrada (MSAA), quando o alvo tem: o passe desenha nela e resolve em `color`. */
    readonly samples?: TextureViewSpec;
    /** Amostras por pixel do alvo (1 sem MSAA): o `multisample.count` dos pipelines que desenham nele. */
    readonly sampleCount: 1 | 4;
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
    /**
     * Entidades com um Resource de cada tipo de `all` (ex.: geometria + material + transform); com `record`, a C2
     * mantém também um registro de GPU por entidade (ver `EntityRecordDeclaration`); com `groups`, os grupos de
     * instâncias (ver `EntityGroupsDeclaration`); com `owns`, a posse da GPU sobre descritores das entidades.
     */
    entities<T extends readonly ResourceType[]>(opts: {
        readonly all: T;
        readonly record?: EntityRecordDeclaration;
        readonly groups?: EntityGroupsDeclaration;
        readonly owns?: readonly (readonly [ResourceType, string])[];
    }): EntitiesSlot<T> {
        return Object.freeze({
            kind: 'entities',
            all: Object.freeze([...opts.all]) as unknown as T,
            ...(opts.record !== undefined ? { record: opts.record } : {}),
            ...(opts.groups !== undefined ? { groups: opts.groups } : {}),
            ...(opts.owns !== undefined ? { owns: Object.freeze([...opts.owns]) } : {}),
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
            | {
                  readonly color: 'canvas' | 'none' | TextureRef;
                  readonly depth?: TextureRef;
                  readonly samples?: TextureRef;
              },
    ): TargetSlot {
        if (target === 'canvas') return Object.freeze({ kind: 'target', color: 'canvas' });
        return Object.freeze({
            kind: 'target',
            color: target.color,
            ...(target.depth !== undefined ? { depth: target.depth } : {}),
            ...(target.samples !== undefined ? { samples: target.samples } : {}),
        });
    },
} as const;
