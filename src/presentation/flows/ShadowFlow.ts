import type { EngineCore, Frame, RenderTarget, UniformBufferSpec } from '../../scene/contracts/gpu';
import type { Resource } from '../../scene/contracts/Resource';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { BoundFlow, PreparedRender, TransitionContext } from '../../scene/flows/FlowBinding';
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
} from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { DirectionalLight } from '../../elements/scene/DirectionalLight';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { Transform } from '../../elements/scene/Transform';
import { ShadowDepthParamsSchema, ShadowInstanceSchema } from './renderSchemas';
import { shadowDepth } from './shaders';

/** O `ShadowMap` de uma `DirectionalLight` que projeta sombra (`castShadow = 1`). */
export function castingShadowMap(world: World): (resource: Resource) => boolean {
    return (resource) => {
        const id = world.entityIdOfResource(resource);
        if (id === undefined) return false;
        const light = world.resourcesOf(id).find((r) => r instanceof DirectionalLight);
        return light?.data.castShadow === 1;
    };
}

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
}

/** Chave do grupo de profundidade: geometria (chave de conteúdo) e orientação das faces. */
export function shadowGroupKey(entry: EntityEntry): string {
    const geometry = entry.get(Geometry).contentKey ?? `entity:${entry.entityId}`;
    return `${geometry}|${isMirrored(entry.get(Transform)) ? 'cw' : 'ccw'}`;
}

function slotsOf(world: World): ShadowSlots {
    const select = castingShadowMap(world);
    return {
        caster: slot.singleton(ShadowMap.schema, { select }),
        world: slot.pool(Transform.worldSchema.name),
        matrices: slot.pool(ShadowMap.matrixSchema.name),
        casters: slot.entities({
            all: [Geometry, Transform],
            groups: {
                schema: ShadowInstanceSchema,
                key: shadowGroupKey,
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
        consumes: [
            Transform.worldSchema.name,
            ShadowMap.matrixSchema.name,
            ShadowInstanceSchema.name,
        ],
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
    override readonly bindings: {
        /** Parâmetros do passe (`ShadowDepthParams`: slot do caster). */
        readonly shadow: UniformBufferSpec;
    };
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<ShadowSlots>>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly params: UniformBufferSpec;
    /** Slot do caster gravado em `ShadowDepthParams` (-1 = ainda não gravado). */
    private writtenSlot = -1;

    constructor(ctx: FlowContext, options: ShadowFlowOptions = {}) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        this.slots = slotsOf(ctx.world);
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'shadow_params_buf',
            byteSize: ShadowDepthParamsSchema.stride,
        });
        this.bindings = { shadow: this.params };
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
                slotsResolved: caster,
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: caster,
                entitiesChanged: 'ignore',
                canvasReconfigured: 'ignore',
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
        frame.render(target, 'ShadowFlow', (pass) => {
            if (groups.length === 0) return;
            // Grupos 0 (parâmetros + pool ShadowMatrix) e 1 (WorldTransform + instâncias) uma vez por passe.
            pass.bind
                .setPipeline(ccw.spec)
                .setBindGroup(0, ccw.groups[0]!)
                .setBindGroup(1, ccw.groups[1]!);
            let current: PreparedRender = ccw;
            for (const group of groups) {
                const entry = group.representative;
                const geometry = entry.get(Geometry);
                const vertices = this.resources.bufferOf(geometry, 'vertices');
                const indices = this.resources.bufferOf(geometry, 'indices');
                if (vertices?.subkind !== 'vertex' || indices?.subkind !== 'index') continue;
                const pipeline = isMirrored(entry.get(Transform)) ? cw : ccw;
                if (!pipeline.ready) continue;
                if (pipeline !== current) {
                    pass.bind.setPipeline(pipeline.spec);
                    current = pipeline;
                }
                pass.geometry.vertex(0, vertices).index(indices);
                pass.draw.indexed(indices.count, group.count, 0, 0, group.first);
            }
        });
    }

    /** Libera o uniform de parâmetros. */
    override dispose(): void {
        this.core.destroy(this.params);
    }

    /** Slot do caster nos parâmetros do passe (escrito quando muda). */
    private updateCaster(ctx: Ctx): void {
        const id = this.world.entityIdOfResource(ctx.bound.slots.caster.resource);
        const casterSlot = id === undefined ? undefined : ctx.bound.slots.matrices.slotOf(id);
        if (casterSlot === undefined || casterSlot === this.writtenSlot) return;
        this.core.write(this.params, ShadowDepthParamsSchema.pack({ casterSlot }));
        this.writtenSlot = casterSlot;
    }
}

/** Escala com produto negativo espelha o objeto (inverte a orientação das faces). */
export function isMirrored(transform: Transform): boolean {
    const scale = transform.data.scale as readonly number[];
    return (scale[0] ?? 1) * (scale[1] ?? 1) * (scale[2] ?? 1) < 0;
}
