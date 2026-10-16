import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type BoundEntities,
    type BoundPool,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import type { EntityId } from '../../../scene/world/EntityId';
import { ExtensionPipelines } from '../../../scene/flows/ExtensionPipelines';
import { Time } from '../../../scene/time/Time';
import { TransformFunction } from '../../extension/TransformFunction';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { Parent } from '../Parent';
import { Transform } from '../Transform';
import { transformCompose, transformComposeFn, transformLink, transformPoint } from './shaders';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import {
    TransformFnGroupSchema,
    TransformFnRecordSchema,
    TransformLevelSchema,
    TransformLinkSchema,
    TransformParamsSchema,
} from './TransformParams';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio de transformação. */
export interface TransformSlots extends SlotMap {
    /** Pool das intenções `Transform` (entrada da composição). */
    readonly transforms: PoolSlot<false>;
    /** Pool das matrizes de mundo `WorldTransform` (saída). */
    readonly worlds: PoolSlot<false>;
    /** Entidades com `Transform` (remoções recompõem). */
    readonly entities: EntitiesSlot;
    /** Entidades com `Transform` e `Parent` (a hierarquia opcional). */
    readonly children: EntitiesSlot;
    /** Entidades com `Transform` e `TransformFunction` (spec 009). */
    readonly functions: EntitiesSlot;
    /** Pool dos registros de parâmetros das `TransformFunction` (existe com alguma função na cena). */
    readonly fnRecords: PoolSlot<true>;
    /** Relógio da cena (tempo simulado das funções; sem relógio, 0). */
    readonly time: SingletonSlot<true>;
}

const slots: TransformSlots = {
    transforms: slot.pool(Transform.schema.name),
    worlds: slot.pool(Transform.worldSchema.name),
    entities: slot.entities({ all: [Transform] }),
    children: slot.entities({ all: [Transform, Parent] }),
    functions: slot.entities({ all: [Transform, TransformFunction] }),
    fnRecords: slot.pool(TransformFnRecordSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
};

/** Elos reservados na lista no primeiro uso (cresce em potências de 2). */
const MIN_LINKS = 64;
/** Pares (Transform, registro) reservados na lista das funções no primeiro uso (cresce em potências de 2). */
const MIN_PAIRS = 64;
/** Bit de `TransformLink.child` que marca filho com função (a local já está em `worlds`). */
const LINK_LOCAL_IN_WORLD = 0x80000000;

/** Um grupo de função: o pipeline e o trecho na lista de pares. */
interface FnGroup {
    readonly id: string;
    readonly first: number;
    readonly count: number;
}

/** `stale`: há intenção de `Transform` ainda não composta; `clean`: as matrizes de mundo estão em dia. */
export type TransformState = 'stale' | 'clean';

type Ctx = TransitionContext<TransformSlots>;

/**
 * Estágio de transformação — produz, na GPU, a matriz de mundo e a matriz de normais de cada `Transform` a partir da
 * sua intenção (posição, rotação, escala), com a convenção `M = T · R · S`. O resultado fica no pool
 * `WorldTransform` (mesmo slot do `Transform`), que os estágios de sombra e desenho leem por índice de instância.
 *
 * Slots: os pools `Transform` e `WorldTransform` (ligados por `consumes`) e as entidades com `Transform`. Reativo
 * pela tabela de transições: fica `stale` com `poolWritten` do pool `Transform`, entidades inseridas ou removidas,
 * pool realocado ou bind group substituído; em `stale`, `framePrepare` escreve a contagem (uma vez por quadro) e o
 * quadro grava a composição; `frameRecorded` volta a `clean` — numa cena parada não faz nada. Se o pool tem slots de
 * posse da GPU (a física publica a pose direto no `Transform`, spec 007), a composição roda todo quadro.
 *
 * Hierarquia opcional (`Parent`, spec 007, research R12): a lista de elos (filho, pai) ordenada por nível é mantida
 * por eventos — refeita só quando o conjunto de filhos, os pais ou a posse da GPU mudam — e enviada numa escrita. O
 * quadro compõe todos os slots (nível 0) e depois cada nível ≥ 1 sobre o seu trecho da lista, com
 * `world = world[pai] · T · R · S`; cada nível lê o anterior já composto (passes em ordem). Sem nenhum `Parent`, um
 * único despacho, como antes. Ciclo, pai sem `Transform` e `Parent` em `Transform` de posse da GPU são erro; pai
 * removido torna o filho raiz com aviso.
 *
 * Substituível: é o estágio padrão da fase `transform`. Registrar outro Flow nessa fase permite outras regras de
 * transformação — a base para a hierarquia opcional, para a função `transform` do usuário e para cadeias não
 * euclidianas do roadmap.
 */
export class TransformFlow extends Flow<TransformSlots, TransformState> {
    readonly type = 'TransformFlow';
    readonly slots = slots;
    override readonly listens = [Transform.schema, TransformFnRecordSchema];
    override readonly pipelines: readonly PipelineDescriptor[] = [
        {
            id: 'transform_compose',
            role: 'compute',
            shader: transformCompose,
            entryPoints: ['transform_compose_main'],
            consumes: [Transform.schema.name, Transform.worldSchema.name],
        },
        {
            id: 'transform_link',
            role: 'compute',
            shader: transformLink,
            entryPoints: ['transform_link_main'],
            consumes: [Transform.schema.name, Transform.worldSchema.name],
        },
    ];
    override readonly bindings: {
        /** Parâmetros da composição (`TransformParams`: contagem). */
        readonly params: UniformBufferSpec;
        /** Elos da hierarquia (`TransformLink`), ordenados por nível. */
        readonly links: StorageBufferSpec;
        /** Trecho de cada nível (`TransformLevel`, uma região por nível, offset dinâmico). */
        readonly level: ReturnType<PerStepUniforms['source']>;
        /** Pares (slot do Transform, slot do registro) das entidades com função, agrupados por função. */
        readonly transform_fn_pairs: StorageBufferSpec;
        /** Trecho e tempo de cada grupo de função (`TransformFnGroup`, uma região por grupo, offset dinâmico). */
        readonly transform_fn_group: ReturnType<PerStepUniforms['source']>;
    };
    protected readonly initialState = 'stale' as const;
    protected readonly transitions: FlowTransitions<
        TransformState,
        TransitionContext<TransformSlots>
    >;

    private readonly core: EngineCore;
    private readonly params: UniformBufferSpec;
    /** Contagem escrita em `TransformParams` (-1 = ainda não escrita). */
    private writtenCount = -1;
    private links: StorageBufferSpec;
    private linkCapacity = MIN_LINKS;
    private readonly levels: PerStepUniforms;
    /** Elos por nível ≥ 1 (`levelCounts[k]` = nível k + 1), da última reconstrução. */
    private levelCounts: readonly number[] = [];
    /** A hierarquia precisa ser refeita (filhos, pais ou posse mudaram). */
    private hierarchyDirty = false;
    /** Pai de cada filho com `Parent`, da última reconstrução (pais removidos são procurados aqui). */
    private parents = new Map<EntityId, EntityId>();
    /** Filhos cujo pai saiu da cena: raízes, já avisados. */
    private readonly orphans = new Set<EntityId>();
    /** `gpuOwned` do pool na última reconstrução (posse nova pode atingir um filho). */
    private ownedAtBuild = 0;
    /** Pipelines das `TransformFunction` presentes (um por código). */
    private readonly fnPipelines = new ExtensionPipelines<TransformFunction>(
        'transform_fn:',
        (module, fn) => ({
            id: '',
            role: 'compute',
            shader: bindPoints(transformComposeFn, new Map([[transformPoint, module]])),
            entryPoints: ['transform_compose_fn_main'],
            consumes: [
                Transform.schema.name,
                Transform.worldSchema.name,
                TransformFnRecordSchema.name,
            ],
            verify: true,
            extensions: [fn],
        }),
    );
    /** As funções (conjunto, códigos ou slots) mudaram desde a última sincronização. */
    private fnDirty = false;
    /** Grupos ativos (função compilada), na ordem da lista de pares. */
    private fnGroups: readonly FnGroup[] = [];
    /** Entidades cuja matriz local vem de uma função ativa (filhos marcados nos elos). */
    private fnEntities: ReadonlySet<EntityId> = new Set();
    private fnPairs: StorageBufferSpec;
    private fnPairCapacity = MIN_PAIRS;
    private readonly fnGroupUniforms: PerStepUniforms;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'transform_compose_params',
            byteSize: TransformParamsSchema.stride,
        });
        this.links = this.createLinks(MIN_LINKS);
        this.levels = new PerStepUniforms(ctx.core, {
            discriminator: 'transform_levels',
            schema: TransformLevelSchema,
        });
        this.levels.reserve(1);
        this.fnPairs = this.createPairs(MIN_PAIRS);
        this.fnGroupUniforms = new PerStepUniforms(ctx.core, {
            discriminator: 'transform_fn_groups',
            schema: TransformFnGroupSchema,
        });
        this.fnGroupUniforms.reserve(1);
        this.bindings = {
            params: this.params,
            links: this.links,
            level: this.levels.source(),
            transform_fn_pairs: this.fnPairs,
            transform_fn_group: this.fnGroupUniforms.source(),
        };
        const stale = { to: 'stale' as const };
        const fnChanged = {
            to: 'stale' as const,
            run: (): void => {
                this.fnDirty = true;
            },
        };
        this.transitions = {
            '*': {
                // Conjuntos (re)resolvidos: a hierarquia e as funções são refeitas a partir das entradas atuais.
                slotsResolved: {
                    to: 'stale',
                    run: () => {
                        this.hierarchyDirty = true;
                        this.fnDirty = true;
                    },
                },
                slotLost: fnChanged,
                slotChanged: fnChanged,
                // Uma função compilada passa a valer; a rejeitada sai (a anterior continua).
                pipelinesCompiled: {
                    to: 'stale',
                    run: (e) => {
                        if (e.type !== 'pipelinesCompiled' || e.pipeline === undefined) return;
                        if (this.fnPipelines.compiled(e.pipeline)) this.fnDirty = true;
                    },
                },
                pipelineRejected: {
                    to: 'stale',
                    run: (e, c) => {
                        if (e.type === 'pipelineRejected') this.fnPipelines.rejected(e.pipeline, c);
                    },
                },
                resourceReady: stale,
                // Registro de função escrito: valores (nada a fazer) ou código novo (revisão).
                poolWritten: {
                    to: 'stale',
                    run: (e) => {
                        if (e.type === 'poolWritten' && e.schema === TransformFnRecordSchema)
                            this.fnDirty = true;
                    },
                },
                entitiesChanged: {
                    to: 'stale',
                    run: (e) => {
                        if (e.type !== 'entitiesChanged') return;
                        this.hierarchyChanged(e.slot, e.removed);
                        if (e.slot === 'functions' || e.slot === 'entities') this.fnDirty = true;
                    },
                },
                poolReallocated: fnChanged,
                bindGroupReplaced: stale,
            },
            stale: {
                framePrepare: {
                    to: 'stale',
                    run: (_e, c) => {
                        this.syncFunctions(c);
                        this.prepareHierarchy(c);
                        this.writeCount(c);
                        this.writeGroups(c);
                    },
                },
                frameRecorded: { to: 'clean' },
            },
            // Com slots de posse da GPU (pose escrita pela física) ou funções (dependem do tempo), a composição roda todo
            // quadro.
            clean: {
                framePrepare: {
                    to: 'clean',
                    run: (_e, c) => {
                        if (c.bound.slots.transforms.gpuOwned === 0 && this.fnGroups.length === 0)
                            return;
                        this.prepareHierarchy(c);
                        this.writeCount(c);
                        this.writeGroups(c);
                    },
                },
                frameRecorded: 'ignore',
            },
        };
    }

    /** Grava a composição quando há intenção pendente (`stale`). */
    dispatch(frame: Frame, bound: BoundFlow<TransformSlots>): void {
        const transforms = bound.slots.transforms;
        if (this.state !== 'stale' && transforms.gpuOwned === 0 && this.fnGroups.length === 0)
            return;
        const count = transforms.count;
        if (count === 0) return;
        const p = bound.compute('transform_compose');
        frame.compute('TransformFlow', (pass) => {
            pass.bind.setPipeline(p.spec).setBindGroup(0, p.groups[0]!);
            pass.dispatch.invocations(count, WORKGROUP_SIZE);
        });
        // Funções do usuário: um despacho por grupo, sobre a matriz do TRS já composta (spec 009).
        this.fnGroups.forEach((group, k) => {
            const fn = bound.compute(group.id);
            if (!fn.ready) return;
            frame.compute('TransformFlow.function', (pass) => {
                pass.bind.setPipeline(fn.spec);
                fn.groups.forEach((bg, g) =>
                    pass.bind.setBindGroup(
                        g,
                        bg,
                        fn.dynamic[g] ? [this.fnGroupUniforms.offset(k)] : undefined,
                    ),
                );
                pass.dispatch.invocations(group.count, WORKGROUP_SIZE);
            });
        });
        if (this.levelCounts.length === 0) return;
        // Um passe por nível, em ordem: cada nível lê as matrizes do anterior já compostas.
        const link = bound.compute('transform_link');
        this.levelCounts.forEach((links, k) => {
            frame.compute('TransformFlow.level', (pass) => {
                pass.bind.setPipeline(link.spec);
                link.groups.forEach((bg, g) =>
                    pass.bind.setBindGroup(
                        g,
                        bg,
                        link.dynamic[g] ? [this.levels.offset(k)] : undefined,
                    ),
                );
                pass.dispatch.invocations(links, WORKGROUP_SIZE);
            });
        });
    }

    /** Libera o uniform de parâmetros, a lista de elos, as regiões dos níveis e as listas das funções. */
    override dispose(): void {
        this.core.destroy(this.params);
        this.core.destroy(this.links);
        this.levels.dispose();
        this.core.destroy(this.fnPairs);
        this.fnGroupUniforms.dispose();
    }

    /** Funções presentes: pipelines por código (ativos ao compilar) e os grupos refeitos. */
    private syncFunctions(ctx: Ctx): void {
        if (!this.fnDirty) return;
        this.fnDirty = false;
        const present = ctx.bound.slots.functions.entries.map((e) => e.get(TransformFunction));
        this.fnPipelines.sync(ctx, present);
        this.rebuildPairs(ctx);
    }

    /** Pares (slot do Transform, slot do registro) por função ativa, agrupados; entidades com função ativa. */
    private rebuildPairs(ctx: Ctx): void {
        const { functions, transforms, fnRecords } = ctx.bound.slots;
        const byId = new Map<string, number[]>();
        const withFn = new Set<EntityId>();
        if (fnRecords !== undefined) {
            for (const entry of functions.entries) {
                const id = this.fnPipelines.active(entry.get(TransformFunction));
                if (id === undefined) continue;
                const t = transforms.slotOf(entry.entityId);
                const r = fnRecords.slotOf(entry.entityId);
                if (t === undefined || r === undefined) continue;
                let list = byId.get(id);
                if (list === undefined) byId.set(id, (list = []));
                list.push(t, r);
                withFn.add(entry.entityId);
            }
        }
        const changedSet =
            withFn.size !== this.fnEntities.size
            || [...withFn].some((id) => !this.fnEntities.has(id));
        if (changedSet) this.hierarchyDirty = true;
        this.fnEntities = withFn;
        const groups: FnGroup[] = [];
        let total = 0;
        for (const [id, pairs] of byId) {
            groups.push({ id, first: total, count: pairs.length / 2 });
            total += pairs.length / 2;
        }
        this.fnGroups = groups;
        if (total === 0) return;
        if (total > this.fnPairCapacity) {
            let capacity = this.fnPairCapacity;
            while (capacity < total) capacity *= 2;
            this.core.destroy(this.fnPairs);
            this.fnPairs = this.createPairs(capacity);
            this.fnPairCapacity = capacity;
            ctx.bind({ transform_fn_pairs: this.fnPairs });
        }
        const data = new Uint32Array(total * 2);
        let at = 0;
        for (const pairs of byId.values()) {
            data.set(pairs, at);
            at += pairs.length;
        }
        this.core.write(this.fnPairs, data);
    }

    /** Trecho e tempo simulado de cada grupo de função (todo quadro com funções). */
    private writeGroups(ctx: Ctx): void {
        if (this.fnGroups.length === 0) return;
        if (this.fnGroupUniforms.reserve(this.fnGroups.length))
            ctx.bind({ transform_fn_group: this.fnGroupUniforms.source() });
        const time = (ctx.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        this.fnGroups.forEach((g, k) => {
            this.fnGroupUniforms.write(k, { first: g.first, count: g.count, time });
        });
        this.fnGroupUniforms.flush(this.fnGroups.length);
    }

    private createPairs(capacity: number): StorageBufferSpec {
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `transform_fn_pairs:${capacity}`,
            byteSize: capacity * 8,
        });
    }

    /**
     * Mudança num conjunto: filhos entrando ou saindo, ou a saída de um pai, pedem a reconstrução da hierarquia. Pai
     * removido: os filhos dele viram raízes, com aviso.
     */
    private hierarchyChanged(slotName: string, removed: readonly EntityId[]): void {
        if (slotName === 'children') {
            this.hierarchyDirty = true;
            for (const id of removed) this.orphans.delete(id);
            return;
        }
        if (slotName !== 'entities' || this.parents.size === 0 || removed.length === 0) return;
        const gone = new Set(removed);
        for (const [child, parent] of this.parents) {
            if (!gone.has(parent) || gone.has(child)) continue;
            this.orphans.add(child);
            this.hierarchyDirty = true;
            console.warn(
                `TransformFlow: o pai (entidade ${parent}) da entidade ${child} saiu da cena — a entidade ${child} `
                    + 'passa a ser raiz (matriz de mundo = local).',
            );
        }
    }

    /** Refaz a hierarquia quando algo mudou (ou a posse da GPU no pool mudou) e envia elos e níveis. */
    private prepareHierarchy(ctx: Ctx): void {
        const transforms = ctx.bound.slots.transforms;
        if (transforms.gpuOwned !== this.ownedAtBuild && this.parents.size > 0)
            this.hierarchyDirty = true;
        if (!this.hierarchyDirty) return;
        this.hierarchyDirty = false;
        this.ownedAtBuild = transforms.gpuOwned;
        const byLevel = buildLevels(
            ctx.bound.slots.children,
            transforms,
            this.orphans,
            this.fnEntities,
        );
        this.parents = byLevel.parents;
        this.levelCounts = byLevel.levels.map((l) => l.length / 2);
        const total = byLevel.levels.reduce((n, l) => n + l.length / 2, 0);
        if (total > this.linkCapacity) {
            let capacity = this.linkCapacity;
            while (capacity < total) capacity *= 2;
            this.core.destroy(this.links);
            this.links = this.createLinks(capacity);
            this.linkCapacity = capacity;
            ctx.bind({ links: this.links });
        }
        if (this.levels.reserve(Math.max(1, this.levelCounts.length)))
            ctx.bind({ level: this.levels.source() });
        if (total === 0) return;
        const data = new Uint32Array(total * 2);
        let first = 0;
        byLevel.levels.forEach((pairs, k) => {
            data.set(pairs, first * 2);
            this.levels.write(k, { first, count: pairs.length / 2 });
            first += pairs.length / 2;
        });
        this.core.write(this.links, data);
        this.levels.flush(this.levelCounts.length);
    }

    private createLinks(capacity: number): StorageBufferSpec {
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `transform_links:${capacity}`,
            byteSize: capacity * TransformLinkSchema.stride,
        });
    }

    /** `TransformParams.count` acompanha o pool (escrita só quando muda). */
    private writeCount(ctx: Ctx): void {
        const count = ctx.bound.slots.transforms.count;
        if (count === this.writtenCount) return;
        this.core.write(this.params, TransformParamsSchema.pack({ count }));
        this.writtenCount = count;
    }
}

/**
 * Elos (slot do filho, slot do pai) agrupados por nível (índice 0 = nível 1) e o pai de cada filho. Valida: pai com
 * `Transform` (filho órfão conhecido vira raiz), sem ciclos e sem `Transform` de posse da GPU no filho.
 */
function buildLevels(
    children: BoundEntities,
    transforms: BoundPool,
    orphans: ReadonlySet<EntityId>,
    withFunction: ReadonlySet<EntityId>,
): { levels: number[][]; parents: Map<EntityId, EntityId> } {
    const parents = new Map<EntityId, EntityId>();
    for (const entry of children.entries) {
        const child = entry.entityId;
        const parent = entry.get(Parent).entity;
        const childSlot = transforms.slotOf(child);
        if (childSlot !== undefined && transforms.ownedByGpu(childSlot)) {
            throw new Error(
                `TransformFlow: a entidade ${child} tem Parent mas o Transform dela é escrito pela GPU (corpo rígido `
                    + 'dinâmico: a pose é de mundo) — tire o Parent ou o corpo.',
            );
        }
        if (transforms.slotOf(parent) === undefined) {
            if (orphans.has(child)) continue;
            throw new Error(
                `TransformFlow: o Parent da entidade ${child} aponta para a entidade ${parent}, que não tem Transform.`,
            );
        }
        parents.set(child, parent);
    }
    const level = new Map<EntityId, number>();
    const levelOf = (id: EntityId): number => {
        const known = level.get(id);
        if (known !== undefined) return known;
        // Sobe até uma raiz (ou um nível conhecido), detectando ciclo pelo caminho.
        const path: EntityId[] = [];
        const onPath = new Set<EntityId>();
        let at: EntityId | undefined = id;
        let base = 0;
        while (at !== undefined) {
            const k = level.get(at);
            if (k !== undefined) {
                base = k;
                break;
            }
            if (onPath.has(at)) {
                const cycle = path.slice(path.indexOf(at));
                throw new Error(
                    `TransformFlow: ciclo de Parent entre as entidades ${cycle.join(' → ')} → ${at}.`,
                );
            }
            onPath.add(at);
            path.push(at);
            at = parents.get(at);
            if (at === undefined) base = -1;
        }
        // `base` é o nível do primeiro ancestral conhecido; sem ele, o último do caminho é raiz (nível 0).
        for (let i = path.length - 1; i >= 0; i--) level.set(path[i]!, ++base);
        return level.get(id)!;
    };
    const levels: number[][] = [];
    for (const [child, parent] of parents) {
        const k = levelOf(child);
        // Filho com função: a local já está em `worlds` (bit 31; spec 009).
        const flag = withFunction.has(child) ? LINK_LOCAL_IN_WORLD : 0;
        (levels[k - 1] ??= []).push(
            (transforms.slotOf(child)! | flag) >>> 0,
            transforms.slotOf(parent)!,
        );
    }
    return { levels, parents };
}
