import type { EngineCore, Frame, RenderTarget, UniformBufferSpec } from '../../scene/contracts/gpu';
import type { Resource } from '../../scene/contracts/Resource';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { BoundFlow, PreparedRender, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowEvent, FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import { slot } from '../../scene/flows/slots';
import type { World } from '../../scene/world/World';
import { Geometry } from '../../elements/geometry/Geometry';
import { DirectionalLight } from '../../elements/scene/DirectionalLight';
import { Light } from '../../elements/scene/Light';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { Transform } from '../../elements/scene/Transform';
import { ShadowDepthParamsSchema } from './renderSchemas';
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

function slotsOf(world: World) {
    const select = castingShadowMap(world);
    return {
        caster: slot.singleton(ShadowMap.schema, { select }),
        world: slot.pool(Transform.worldSchema.name),
        shadowMaps: slot.pool(ShadowMap.schema.name),
        casters: slot.entities({ all: [Geometry, Transform] }),
        target: slot.target({
            color: 'none',
            depth: { schema: ShadowMap.schema, descId: 'depth', select },
        }),
    };
}

/** Slots do estágio de sombra. */
export type ShadowSlots = ReturnType<typeof slotsOf>;

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
        consumes: [Transform.worldSchema.name, ShadowMap.schema.name],
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
 * Slots: o `ShadowMap` da luz (caster), os pools `WorldTransform` e `ShadowMap` e as entidades com geometria e
 * transform. A matriz luz-vista-projeção é calculada na CPU quando a luz muda (`resourceReady` da luz, escuta de
 * `Light`) ou quando o caster aparece, e gravada em `ShadowMap.data.lightViewProj` — o envio reativo da C2 a leva ao
 * pool, que este estágio e o render principal leem pelo slot do mapa. A geometria é a alocada pela C2 (nenhuma cópia
 * por entidade); a posição vem do pool `WorldTransform` pelo slot da entidade (`firstInstance`).
 */
export class ShadowFlow extends RenderFlow<ShadowSlots, 'idle'> {
    readonly type = 'ShadowFlow';
    readonly slots: ShadowSlots;
    override readonly listens = [Light.schema];
    override readonly pipelines: readonly PipelineDescriptor[];
    override readonly bindings: { readonly shadow: UniformBufferSpec };
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

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
                resourceReady: {
                    to: 'idle',
                    run: (e, c) => {
                        this.lightChanged(e, c);
                    },
                },
            },
        };
    }

    /** Grava a profundidade de cada entidade com geometria e transform. */
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
        const world = bound.slots.world;
        const entries = bound.slots.casters.entries;
        frame.render(target, 'ShadowFlow', (pass) => {
            if (entries.length === 0) return;
            // Grupos 0 (parâmetros + pool ShadowMap) e 1 (WorldTransform) uma vez por passe.
            pass.bind
                .setPipeline(ccw.spec)
                .setBindGroup(0, ccw.groups[0]!)
                .setBindGroup(1, ccw.groups[1]!);
            let current: PreparedRender = ccw;
            for (const entry of entries) {
                const worldSlot = world.slotOf(entry.entityId);
                if (worldSlot === undefined) continue; // ainda sem slot ⇒ não desenha
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
                pass.draw.indexed(indices.count, 1, 0, 0, worldSlot);
            }
        });
    }

    /** Libera o uniform de parâmetros. */
    override dispose(): void {
        this.core.destroy(this.params);
    }

    /** Slot do caster nos parâmetros do passe e a matriz da luz dele. */
    private updateCaster(ctx: Ctx): void {
        const shadowMap = ctx.bound.slots.caster.resource as ShadowMap;
        const id = this.world.entityIdOfResource(shadowMap);
        const casterSlot = id === undefined ? undefined : ctx.bound.slots.shadowMaps.slotOf(id);
        if (casterSlot !== undefined && casterSlot !== this.writtenSlot) {
            this.core.write(this.params, ShadowDepthParamsSchema.pack({ casterSlot }));
            this.writtenSlot = casterSlot;
        }
        this.writeLightViewProj(shadowMap);
    }

    /** A luz do caster mudou: recalcula a matriz. */
    private lightChanged(event: FlowEvent, ctx: Ctx): void {
        if (event.type !== 'resourceReady') return;
        const resource = event.resource;
        const shadowMap = ctx.bound.slots.caster.resource as ShadowMap;
        const id = this.world.entityIdOfResource(shadowMap);
        if (id === undefined || !this.world.resourcesOf(id).includes(resource)) return;
        this.writeLightViewProj(shadowMap);
    }

    /** Matriz luz-vista-projeção (ortográfica ±10, olho a 10 m contra a direção da luz) gravada no `ShadowMap`. */
    private writeLightViewProj(shadowMap: ShadowMap): void {
        const id = this.world.entityIdOfResource(shadowMap);
        const light =
            id === undefined
                ? undefined
                : this.world.resourcesOf(id).find((r) => r instanceof DirectionalLight);
        if (light === undefined) return;
        const dir = (light.data.direction as readonly number[] | undefined) ?? [0, -1, 0, 0];
        const dx = dir[0] ?? 0;
        const dy = dir[1] ?? -1;
        const dz = dir[2] ?? 0;
        const view = lookAt([-dx * 10, -dy * 10, -dz * 10], [0, 0, 0], [0, 1, 0]);
        const proj = ortho(-10, 10, -10, 10, 0.1, 50);
        const vp = mul(proj, view);
        const current = shadowMap.data.lightViewProj as readonly number[];
        if (current.length === vp.length && current.every((v, i) => v === vp[i])) return;
        shadowMap.data.lightViewProj = vp;
    }
}

/** Escala com produto negativo espelha o objeto (inverte a orientação das faces). */
export function isMirrored(transform: Transform): boolean {
    const scale = transform.data.scale as readonly number[];
    return (scale[0] ?? 1) * (scale[1] ?? 1) * (scale[2] ?? 1) < 0;
}

function lookAt(e: number[], t: number[], u: number[]): number[] {
    let zx = (e[0] ?? 0) - (t[0] ?? 0),
        zy = (e[1] ?? 0) - (t[1] ?? 0),
        zz = (e[2] ?? 0) - (t[2] ?? 0);
    const zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl;
    zy /= zl;
    zz /= zl;
    let xx = (u[1] ?? 0) * zz - (u[2] ?? 0) * zy,
        xy = (u[2] ?? 0) * zx - (u[0] ?? 0) * zz,
        xz = (u[0] ?? 0) * zy - (u[1] ?? 1) * zx;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const yx = zy * xz - zz * xy,
        yy = zz * xx - zx * xz,
        yz = zx * xy - zy * xx;
    return [
        xx,
        yx,
        zx,
        0,
        xy,
        yy,
        zy,
        0,
        xz,
        yz,
        zz,
        0,
        -(xx * (e[0] ?? 0) + xy * (e[1] ?? 0) + xz * (e[2] ?? 0)),
        -(yx * (e[0] ?? 0) + yy * (e[1] ?? 0) + yz * (e[2] ?? 0)),
        -(zx * (e[0] ?? 0) + zy * (e[1] ?? 0) + zz * (e[2] ?? 0)),
        1,
    ];
}

function ortho(l: number, r: number, b: number, t: number, n: number, f: number): number[] {
    return [
        2 / (r - l),
        0,
        0,
        0,
        0,
        2 / (t - b),
        0,
        0,
        0,
        0,
        1 / (n - f),
        0,
        (r + l) / (l - r),
        (t + b) / (b - t),
        n / (n - f),
        1,
    ];
}

function mul(a: number[], b: number[]): number[] {
    const o: number[] = new Array<number>(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += (a[k * 4 + j] ?? 0) * (b[i * 4 + k] ?? 0);
            o[i * 4 + j] = s;
        }
    }
    return o;
}
