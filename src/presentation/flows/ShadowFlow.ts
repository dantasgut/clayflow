import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    RenderTarget,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { FlowWork } from '../../scene/flows/FlowWork';
import type {
    BindingSource,
    BoundFlow,
    PreparedRender,
    TransitionContext,
} from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import {
    slot,
    type EntitiesSlot,
    type EntityEntry,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TargetSlot,
    type WorkSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { Material } from '../../elements/material/Material';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { castingShadowMap } from '../../elements/scene/shadowCaster';
import { Transform } from '../../elements/scene/Transform';
import { GpuWordSchema } from '../../elements/gpu/compute/schemas';
import { ShadowDepthParamsSchema, ShadowInstanceSchema } from './renderSchemas';
import { shadowDepth, shadowResources } from './shaders';

/** Slots do estágio de sombra. */
export interface ShadowSlots extends SlotMap {
    /** `ShadowMap` da primeira `DirectionalLight` que projeta sombra. */
    readonly caster: SingletonSlot<false>;
    /** Pool `WorldTransform` (matriz de mundo pelo slot da entidade). */
    readonly world: PoolSlot<false>;
    /** Pool `ShadowMatrix` (matriz da luz pelo slot do caster, produzida na GPU pelo `ShadowMatrixFlow`). */
    readonly matrices: PoolSlot<false>;
    /** Entidades desenhadas no mapa (geometria + transform), em grupos por (geometria, orientação) mantidos pela C2. */
    readonly casters: EntitiesSlot;
    /** Alvo só de profundidade: a textura `depth` do `ShadowMap` do caster. */
    readonly target: TargetSlot;
    /** O espaço de trabalho do passe: parâmetros e argumentos indiretos (spec 039). */
    readonly work: WorkSlot<ShadowWork>;
}

/** Id do uniform de parâmetros no trabalho. */
const PARAMS = 'shadow_params';
/** Id dos argumentos indiretos por grupo no trabalho (5 palavras por grupo, `drawIndexedIndirect`). */
const INDIRECT = 'shadow_indirect';
/** Palavras de um registro de desenho indexado indireto. */
const INDIRECT_WORDS = 5;

/**
 * Resource de trabalho do `ShadowFlow` (spec 039): `ShadowDepthParams` (escrito da CPU quando o caster muda) e os
 * argumentos indiretos dos grupos com registro indireto na geometria, um registro por grupo (capacidade em potências
 * de 2).
 */
class ShadowWork extends FlowWork {
    static readonly schema = new StructSchema('ShadowWork', {});
    /** Registros de argumentos indiretos reservados. */
    indirectCapacity = 0;

    constructor() {
        super();
        this.use({
            descriptors: (): readonly GPUDescriptor[] => [
                // Escritos da CPU só quando mudam (`writeNow`), cada um por si.
                { id: PARAMS, role: 'uniform', schema: ShadowDepthParamsSchema, upload: 'never' },
                ...(this.indirectCapacity === 0
                    ? []
                    : [
                          {
                              id: INDIRECT,
                              role: 'indirect' as const,
                              schema: GpuWordSchema,
                              upload: 'never' as const,
                              count: this.indirectCapacity * INDIRECT_WORDS,
                          },
                      ]),
            ],
        });
    }
}

/** Prefixo da chave dos grupos que não projetam sombra (material com `castsShadow` falso): não desenhados. */
const NO_SHADOW = 'no-shadow|';

/**
 * Chave do grupo de profundidade: geometria (chave de conteúdo) e orientação das faces. A entidade cujo material não
 * projeta sombra (spec 008: linhas e sprites, salvo opção do material) vai para um grupo `no-shadow`, não desenhado;
 * sem material, projeta.
 */
export function shadowGroupKey(entry: EntityEntry, world: World): string {
    const geometry = entry.get(Geometry).contentKey ?? `entity:${entry.entityId}`;
    const material = world.resourcesOf(entry.entityId).find((r) => r instanceof Material);
    const casts = material === undefined || (material as Material).castsShadow;
    return `${casts ? '' : NO_SHADOW}${geometry}|${entry.get(Transform).mirrored ? 'cw' : 'ccw'}`;
}

function slotsOf(world: World, work: ShadowWork): ShadowSlots {
    const select = castingShadowMap(world);
    return {
        work: slot.work(() => work),
        caster: slot.singleton(ShadowMap.schema, { select }),
        world: slot.pool(Transform.worldSchema.name),
        matrices: slot.pool(ShadowMap.matrixSchema.name),
        casters: slot.entities({
            all: [Geometry, Transform],
            groups: {
                schema: ShadowInstanceSchema,
                key: (entry) => shadowGroupKey(entry, world),
                instance: [Transform, 'world'],
                rekeyOn: { [Transform.schema.name]: ['scale'] },
            },
        }),
        target: slot.target({
            color: 'none',
            depth: { schema: ShadowMap.schema, descId: 'depth', select },
        }),
    };
}

type Ctx = TransitionContext<ShadowSlots>;

const VERTEX_LAYOUT = [
    {
        arrayStride: 32,
        stepMode: 'vertex' as const,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' as const }],
    },
];

function depthPipeline(frontFace: GPUFrontFace, preferAsync: boolean): PipelineDescriptor {
    return {
        id: `shadow_depth:${frontFace}`,
        role: 'render',
        shader: shadowDepth,
        entryPoints: ['vs_main'],
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace,
        vertexBuffers: VERTEX_LAYOUT,
        depth: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
        ...(preferAsync ? { preferAsync: true } : {}),
    };
}

/** Opções do `ShadowFlow`. */
export interface ShadowFlowOptions {
    /** Compila os pipelines em segundo plano; o estágio entra no quadro quando prontos. */
    readonly preferAsync?: boolean;
}

/**
 * ShadowFlow — passe só de profundidade do ponto de vista da primeira `DirectionalLight` que projeta sombra, na
 * textura do `ShadowMap` dela (slot `target`).
 *
 * Slots: o `ShadowMap` da luz (caster), os pools `WorldTransform` e `ShadowMatrix` e as entidades com geometria e
 * transform. A matriz luz-vista-projeção é produzida na GPU pelo `ShadowMatrixFlow` (fase `transform`) a partir da
 * direção da luz; este estágio só escreve o slot do caster nos seus parâmetros quando ele muda — a CPU não acompanha a
 * luz. A geometria é a alocada pela C2 (nenhuma cópia por entidade); um desenho por grupo de instâncias (mesma geometria e orientação), e cada instância acha o seu slot
 * no pool `WorldTransform` pela lista de instâncias (`ShadowInstance`).
 */
export class ShadowFlow extends RenderFlow<ShadowSlots, 'idle'> {
    readonly type = 'ShadowFlow';
    readonly slots: ShadowSlots;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<ShadowSlots>>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly work: ShadowWork;
    /** Slot do caster gravado em `ShadowDepthParams` (-1 = ainda não gravado). */
    private writtenSlot = -1;
    /**
     * Argumentos do desenho indireto dos grupos com registro indireto na geometria (malha adaptativa, spec 010): o
     * registro do grupo no buffer do trabalho (`first`/`count` do grupo deste passe) e a contagem copiada da geometria
     * antes do passe.
     */
    private readonly indirectArgs = new Map<
        string,
        { readonly record: number; readonly source: IndirectBufferSpec }
    >();

    constructor(ctx: FlowContext, options: ShadowFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.work = new ShadowWork();
        this.slots = slotsOf(ctx.world, this.work);
        const async = options.preferAsync === true;
        this.pipelines = [depthPipeline('ccw', async), depthPipeline('cw', async)];
        const caster = {
            to: 'idle' as const,
            run: (_e: unknown, c: Ctx) => {
                this.updateCaster(c);
            },
        };
        this.transitions = {
            '*': {
                // O trabalho já está na cena: o uniform de parâmetros (fonte privada) liga ao que a C2 alocou.
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        const params = this.resources.bufferOf(
                            this.work,
                            PARAMS,
                        ) as UniformBufferSpec;
                        c.bind(
                            new Map<WgslResource, BindingSource>([
                                [shadowResources.params, params],
                            ]),
                        );
                        this.updateCaster(c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: caster,
                entitiesChanged: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepareIndirect(c);
                    },
                },
            },
        };
    }

    /** Grava a profundidade: um desenho por grupo de instâncias (geometria, orientação). */
    dispatch(frame: Frame, bound: BoundFlow<ShadowSlots>): void {
        const depth = bound.slots.target.depth;
        if (depth === undefined) return;
        const target: RenderTarget = {
            colorAttachments: [],
            depthStencilAttachment: {
                view: depth,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        };
        const ccw = bound.render('shadow_depth:ccw');
        const cw = bound.render('shadow_depth:cw');
        const groups = bound.slots.casters.groups;
        const args = this.resources.bufferOf(this.work, INDIRECT) as IndirectBufferSpec | undefined;
        if (args !== undefined)
            for (const { record, source } of this.indirectArgs.values())
                frame.copy(source, args, 4, 0, record * INDIRECT_WORDS * 4);
        frame.render(target, 'ShadowFlow', (pass) => {
            if (groups.length === 0) return;
            // Grupos (pool ShadowMatrix; parâmetros, WorldTransform e instâncias) uma vez por passe.
            pass.bind.setPipeline(ccw.spec);
            ccw.bindTo(pass.bind);
            let current: PreparedRender = ccw;
            for (const group of groups) {
                if (group.key.startsWith(NO_SHADOW)) continue;
                const entry = group.representative;
                const geometry = entry.get(Geometry);
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                if (vertices?.subkind !== 'vertex') continue;
                const pipeline = entry.get(Transform).mirrored ? cw : ccw;
                if (!pipeline.ready) continue;
                if (pipeline !== current) {
                    pass.bind.setPipeline(pipeline.spec);
                    current = pipeline;
                }
                pass.geometry.vertex(0, vertices);
                const indices = this.resources.bufferOf(geometry, 'indices');
                if (indices?.subkind === 'index') {
                    pass.geometry.index(indices);
                    const record = this.indirectArgs.get(group.key)?.record;
                    if (record !== undefined && args !== undefined)
                        pass.draw.indexedIndirect(args, record * INDIRECT_WORDS * 4);
                    else pass.draw.indexed(indices.count, group.count, 0, 0, group.first);
                } else {
                    // Geometria sem índices (ex.: escrita por um estágio): pela contagem de vértices.
                    pass.draw.vertices(geometry.vertexCount, group.count, 0, group.first);
                }
            }
        });
    }

    /** Os parâmetros e os argumentos são do `ShadowWork` (a C2 os libera com ele). */
    override dispose(): void {
        this.indirectArgs.clear();
    }

    /**
     * Argumentos indiretos dos grupos com registro indireto na geometria (malha adaptativa, spec 010); sem
     * `indirect-first-instance`, nenhum (desenho direto pela capacidade, preenchida no nível máximo).
     */
    private prepareIndirect(ctx: Ctx): void {
        const on = this.core.capabilities().features.includes('indirect-first-instance');
        const records: {
            group: (typeof ctx.bound.slots.casters.groups)[number];
            source: IndirectBufferSpec;
        }[] = [];
        if (on)
            for (const group of ctx.bound.slots.casters.groups) {
                if (group.key.startsWith(NO_SHADOW)) continue;
                const source = this.resources.bufferOf(
                    group.representative.get(Geometry),
                    'indirect',
                );
                if (source?.subkind !== 'indirect') continue;
                records.push({ group, source });
            }
        this.indirectArgs.clear();
        // Sem grupos indiretos: o buffer fica com o que tinha (nenhum desenho o lê).
        if (records.length === 0) return;
        let capacity = Math.max(1, this.work.indirectCapacity);
        while (capacity < records.length) capacity *= 2;
        // Um registro por grupo; a contagem de índices (palavra 0) é copiada da geometria antes do passe.
        const words = new Uint32Array(capacity * INDIRECT_WORDS);
        records.forEach(({ group, source }, record) => {
            words.set([0, group.count, 0, 0, group.first], record * INDIRECT_WORDS);
            this.indirectArgs.set(group.key, { record, source });
        });
        if (capacity !== this.work.indirectCapacity) {
            // A C2 aloca o buffer na capacidade nova.
            this.work.indirectCapacity = capacity;
            this.work.refresh();
        }
        this.resources.writeNow(this.work, INDIRECT, words);
    }

    /** Slot do caster nos parâmetros do passe (escrito quando muda). */
    private updateCaster(ctx: Ctx): void {
        const id = this.world.entityIdOfResource(ctx.bound.slots.caster.resource);
        const casterSlot = id === undefined ? undefined : ctx.bound.slots.matrices.slotOf(id);
        if (casterSlot === undefined || casterSlot === this.writtenSlot) return;
        this.resources.writeNow(this.work, PARAMS, ShadowDepthParamsSchema.pack({ casterSlot }));
        this.writtenSlot = casterSlot;
    }
}
