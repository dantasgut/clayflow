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
    type SlotMap,
} from '../../../scene/flows/slots';
import type { EntityId } from '../../../scene/world/EntityId';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { Parent } from '../Parent';
import { Transform } from '../Transform';
import { transformCompose, transformLink } from './shaders';
import {
    TransformLevelSchema,
    TransformLinkSchema,
    TransformParamsSchema,
} from './TransformParams';

const WORKGROUP_SIZE = 64;

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
}

const slots: TransformSlots = {
    transforms: slot.pool(Transform.schema.name),
    worlds: slot.pool(Transform.worldSchema.name),
    entities: slot.entities({ all: [Transform] }),
    children: slot.entities({ all: [Transform, Parent] }),
};

/** Elos reservados na lista no primeiro uso (cresce em potências de 2). */
const MIN_LINKS = 64;

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
    override readonly listens = [Transform.schema];
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
        this.bindings = { params: this.params, links: this.links, level: this.levels.source() };
        const stale = { to: 'stale' as const };
        this.transitions = {
            '*': {
                // Conjuntos (re)resolvidos: a hierarquia é refeita a partir das entradas atuais.
                slotsResolved: {
                    to: 'stale',
                    run: () => {
                        this.hierarchyDirty = true;
                    },
                },
                slotLost: stale,
                pipelinesCompiled: stale,
                resourceReady: stale,
                poolWritten: stale,
                entitiesChanged: {
                    to: 'stale',
                    run: (e) => {
                        if (e.type === 'entitiesChanged') this.hierarchyChanged(e.slot, e.removed);
                    },
                },
                poolReallocated: stale,
                bindGroupReplaced: stale,
            },
            stale: {
                framePrepare: {
                    to: 'stale',
                    run: (_e, c) => {
                        this.prepareHierarchy(c);
                        this.writeCount(c);
                    },
                },
                frameRecorded: { to: 'clean' },
            },
            // Com slots de posse da GPU (pose escrita pela física), a composição roda todo quadro.
            clean: {
                framePrepare: {
                    to: 'clean',
                    run: (_e, c) => {
                        if (c.bound.slots.transforms.gpuOwned === 0) return;
                        this.prepareHierarchy(c);
                        this.writeCount(c);
                    },
                },
                frameRecorded: 'ignore',
            },
        };
    }

    /** Grava a composição quando há intenção pendente (`stale`). */
    dispatch(frame: Frame, bound: BoundFlow<TransformSlots>): void {
        const transforms = bound.slots.transforms;
        if (this.state !== 'stale' && transforms.gpuOwned === 0) return;
        const count = transforms.count;
        if (count === 0) return;
        const p = bound.compute('transform_compose');
        frame.compute('TransformFlow', (pass) => {
            pass.bind.setPipeline(p.spec).setBindGroup(0, p.groups[0]!);
            pass.dispatch.invocations(count, WORKGROUP_SIZE);
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

    /** Libera o uniform de parâmetros, a lista de elos e as regiões dos níveis. */
    override dispose(): void {
        this.core.destroy(this.params);
        this.core.destroy(this.links);
        this.levels.dispose();
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
        const byLevel = buildLevels(ctx.bound.slots.children, transforms, this.orphans);
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
        (levels[k - 1] ??= []).push(transforms.slotOf(child)!, transforms.slotOf(parent)!);
    }
    return { levels, parents };
}
