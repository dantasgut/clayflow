import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
    TextureSpec,
    TextureViewSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { World } from '../../scene/world/World';
import { FluidField } from '../../elements/fields/FluidField';
import { fieldResources } from '../../elements/fields/shaders';
import { FluidSurfaceMaterial } from '../../elements/material/FluidSurfaceMaterial';
import { ParticleBody } from '../../elements/physics/bodies/ParticleBody';
import { Camera } from '../../elements/scene/Camera';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { camerasResource, shadowMatricesResource } from '../../elements/scene/resources';
import { castingShadowMap } from '../../elements/scene/shadowCaster';
import { FrameTargets } from '../app/FrameTargets';
import { WATER_LIGHT_TEXTURES, WATER_VIEW_TEXTURES, WaterSurface } from '../app/WaterSurface';
import { WaterViewParamsSchema } from '../water/schemas';
import { waterField, waterResources as R } from '../water/shaders';

/** Vista de um produtor da superfície de água: a da câmera (o que se vê) ou a da luz que projeta sombra (cáusticas). */
export type WaterView = 'camera' | 'light';

/** Opções do `FluidFieldPassFlow`. */
export interface FluidFieldPassFlowOptions {
    /** Vista produzida. Padrão `'camera'`. */
    readonly view?: WaterView;
}

/** Slots do produtor da superfície de água pelo campo dos fluidos. */
export interface FluidFieldPassSlots extends SlotMap {
    /** Câmera ativa. */
    readonly camera: SingletonSlot<false>;
    /** Pool `CameraMatrices` (produzido na GPU pelo estágio de câmera). */
    readonly cameras: PoolSlot<false>;
    /** `ShadowMap` da luz que projeta sombra (vista da luz; opcional). */
    readonly caster: SingletonSlot<true>;
    /** Pool `ShadowMap` (o slot do mapa da luz que projeta). */
    readonly shadowMaps: PoolSlot<true>;
    /** Pool `ShadowMatrix` (direção da luz, produzida na GPU). */
    readonly shadowMatrices: PoolSlot<true>;
    /** O campo dos fluidos da cena (construído na GPU pelo `FluidFieldFlow`). */
    readonly field: SingletonSlot<false>;
    /** Corpos de partículas com material de água (há água quando algum tem partículas). */
    readonly bodies: EntitiesSlot;
    /** A superfície de água da cena (texturas compartilhadas com os consumidores). */
    readonly water: SingletonSlot<false>;
    /** Profundidade da cena (vista da câmera: a água atrás dos objetos não entra). */
    readonly sceneDepth: TextureSlot<true>;
}

type Ctx = TransitionContext<FluidFieldPassSlots>;

/** Kernels da vista com as fontes com que foram feitos (refeitos quando alguma muda). */
interface ViewKernels {
    readonly sources: readonly unknown[];
    readonly march: ComputeKernel;
    readonly fit: ComputeKernel | undefined;
}

/**
 * FluidFieldPassFlow — produtor da superfície de água pelo campo dos fluidos (spec 033, R11): um raio por pixel marcha
 * no campo (`FluidField`, distância com sinal construída na GPU a cada quadro) e escreve a superfície genérica no
 * `WaterSurface` — sem esferas por partícula nem suavização na tela: a silhueta e a normal são as do campo, contínuas,
 * iguais de perto e de longe e em qualquer resolução.
 *
 *   - vista `'camera'` (fase `forward`, depois dos opacos e dos sprites): profundidade linear, espessura (a corda até
 *     sair do fluido, cortada pela cena), material e normal em mundo; a água atrás de um objeto não entra;
 *   - vista `'light'` (fase `shadow`, depois do mapa de sombra): o enquadramento da luz ajustado à caixa do campo e,
 *     por texel, a profundidade, o material e a normal vistos pela luz que projeta sombra — a entrada das cáusticas.
 *
 * As texturas são alocadas sob demanda quando entra o primeiro corpo com água (sem água, nada é alocado nem gravado).
 * Os consumidores (`CausticsFlow`, `WaterFlow`) leem a superfície sem saber de partículas nem do campo.
 */
export class FluidFieldPassFlow extends Flow<FluidFieldPassSlots, 'idle'> {
    readonly type = 'FluidFieldPassFlow';
    readonly slots: FluidFieldPassSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    /** Vista produzida. */
    readonly view: WaterView;
    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly params: UniformBufferSpec;
    private kernels: ViewKernels | undefined;
    private written = '';
    private size = { width: 1, height: 1 };
    /** A vista tem o que produzir neste quadro (água, texturas e, na luz, o mapa de sombra). */
    private active = false;
    private water: WaterSurface | undefined;

    constructor(ctx: FlowContext, options: FluidFieldPassFlowOptions = {}) {
        super();
        this.view = options.view ?? 'camera';
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        const select = castingShadowMap(ctx.world);
        this.slots = {
            camera: slot.singleton(Camera.schema),
            cameras: slot.pool(Camera.matricesSchema.name),
            caster: slot.singleton(ShadowMap.schema, { optional: true, select }),
            shadowMaps: slot.pool(ShadowMap.schema.name, { optional: true }),
            shadowMatrices: slot.pool(ShadowMap.matrixSchema.name, { optional: true }),
            field: slot.singleton(FluidField.schema),
            bodies: slot.entities({ all: [ParticleBody, FluidSurfaceMaterial] }),
            water: slot.singleton(WaterSurface.schema),
            sceneDepth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        };
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `water_field_${this.view}_params`,
            byteSize: WaterViewParamsSchema.stride,
        });
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                entitiesChanged: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepareFrame(c);
                    },
                },
            },
        };
    }

    /** Grava a marcha da vista (na luz, antes o enquadramento). */
    dispatch(frame: Frame, _bound: BoundFlow<FluidFieldPassSlots>): void {
        const k = this.kernels;
        if (!this.active || k === undefined) return;
        const { width, height } = this.size;
        frame.compute(
            this.view === 'light' ? 'FluidFieldPassFlow.light' : 'FluidFieldPassFlow.camera',
            (pass) => {
                const run = (kernel: ComputeKernel, x: number, y: number): void => {
                    pass.bind.setPipeline(kernel.pipeline);
                    kernel.bindTo(pass.bind);
                    pass.dispatch.workgroups(x, y);
                };
                if (k.fit !== undefined) run(k.fit, 1, 1);
                run(k.march, Math.ceil(width / 8), Math.ceil(height / 8));
            },
        );
    }

    /** Libera kernels e parâmetros. */
    override dispose(): void {
        this.releaseKernels();
        this.core.destroy(this.params);
    }

    /** Antes da gravação: há água, texturas, parâmetros e kernels (refeitos quando uma fonte muda). */
    private prepareFrame(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const hasWater = slots.bodies.entries.some((e) => e.get(ParticleBody).count > 0);
        const shadowSlot = this.shadowSlot(ctx);
        const ready =
            hasWater
            && (this.view === 'camera'
                ? slots.sceneDepth !== undefined
                : shadowSlot !== undefined && slots.shadowMatrices !== undefined);
        if (!ready) {
            if (this.active) this.produced(ctx, this.water, false);
            this.active = false;
            return;
        }
        const water = this.allocate(ctx);
        const field = slots.field.resource as FluidField;
        const kernels = this.prepareKernels(ctx, water, field, shadowSlot ?? 0);
        this.active = kernels !== undefined;
        this.produced(ctx, water, this.active);
    }

    /**
     * Aloca as texturas da vista no `WaterSurface` na primeira vez em que há o que produzir (sob demanda: sem água — ou,
     * na vista da luz, sem luz que projete sombra —, nada é alocado).
     */
    private allocate(ctx: Ctx): WaterSurface {
        const water = ctx.bound.slots.water.resource as WaterSurface;
        if (this.water === water) return water;
        this.water = water;
        for (const id of this.view === 'light' ? WATER_LIGHT_TEXTURES : WATER_VIEW_TEXTURES) {
            this.resources.ensureAllocated(water, id);
        }
        return water;
    }

    /**
     * Declara à C2 se a superfície desta vista foi produzida no quadro (spec 031, R5: `depth` na vista da câmera,
     * `lightDepth` na da luz) — os consumidores (`WaterFlow`, `CausticsFlow`) consultam `isProduced`. A vista da luz
     * também liga as cáusticas na transmissão da luz.
     */
    private produced(ctx: Ctx, water: WaterSurface | undefined, produced: boolean): void {
        if (water === undefined) return;
        ctx.produced(water, WaterSurface.producedDescriptor[this.view], produced);
        if (this.view === 'light') water.setCaustics(produced);
    }

    /** Parâmetros (escritos quando mudam) e os kernels da vista com as fontes atuais. */
    private prepareKernels(
        ctx: Ctx,
        water: WaterSurface,
        field: FluidField,
        shadowSlot: number,
    ): ViewKernels | undefined {
        const slots = ctx.bound.slots;
        const light = this.view === 'light';
        const tex = (id: string): TextureViewSpec | undefined =>
            this.resources.textureViewOf(water, id);
        const buffer = (id: string): AnyBufferSpec | undefined =>
            this.resources.bufferOf(field, id);
        const fieldSources: [WgslResource, AnyBufferSpec | undefined][] = [
            [fieldResources.params, buffer('params')],
            [fieldResources.data, buffer('data')],
        ];
        const outputs: [WgslResource, TextureViewSpec | undefined][] = light
            ? [
                  [R.outDepth, tex('lightDepth')],
                  [R.outMaterial, tex('lightMaterial')],
                  [R.outNormal, tex('lightNormal')],
              ]
            : [
                  [R.outDepth, tex('depth')],
                  [R.outMaterial, tex('material')],
                  [R.outNormal, tex('normal')],
              ];
        const target: TextureSpec | undefined = this.resources.textureOf(
            water,
            light ? 'lightDepth' : 'depth',
        );
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        const lightMatrix = this.resources.bufferOf(water, 'lightMatrix');
        const sceneDepth = slots.sceneDepth;
        const shadows = slots.shadowMatrices?.buffer;
        const march: [WgslResource, unknown][] = [
            ...fieldSources,
            ...outputs,
            [R.view, this.params],
        ];
        let shader = waterField.scene;
        if (light) {
            march.push([R.lightMatrix, lightMatrix]);
        } else {
            const samples = sceneDepth?.texture.sampleCount ?? 1;
            shader = samples > 1 ? waterField.sceneMs : waterField.scene;
            march.push(
                [R.materials, materials],
                [camerasResource, slots.cameras.buffer],
                [samples > 1 ? R.sceneDepthMs : R.sceneDepth, sceneDepth?.view],
            );
        }
        const fit: [WgslResource, unknown][] | undefined = light
            ? [
                  [fieldResources.params, buffer('params')],
                  [fieldResources.data, buffer('data')],
                  [shadowMatricesResource, shadows],
                  [R.view, this.params],
                  [R.lightMatrixWrite, lightMatrix],
              ]
            : undefined;
        const sources = [shader, ...march.map(([, s]) => s), ...(fit ?? []).map(([, s]) => s)];
        if (target === undefined || sources.some((s) => s === undefined)) return undefined;
        this.size = { width: target.width, height: target.height };
        this.writeParams(ctx, shadowSlot);
        const known = this.kernels;
        if (known !== undefined && sameSources(known.sources, sources)) return known;
        this.releaseKernels();
        const kernel = (entryPoint: string, bindings: [WgslResource, unknown][]): ComputeKernel =>
            createComputeKernel(this.core, {
                discriminator: `water_field_${this.view}_${entryPoint}`,
                shader,
                entryPoint,
                bindings: new Map(bindings) as ReadonlyMap<WgslResource, BindingSource>,
            });
        this.kernels = {
            sources,
            march: kernel(light ? 'water_field_light' : 'water_field_camera', march),
            fit: fit === undefined ? undefined : kernel('water_field_fit', fit),
        };
        return this.kernels;
    }

    /** Slots da câmera e do mapa, a vista e o tamanho do alvo — escritos quando mudam. */
    private writeParams(ctx: Ctx, shadowSlot: number): void {
        const slots = ctx.bound.slots;
        const cameraId = this.world.entityIdOfResource(slots.camera.resource);
        const cameraSlot = cameraId === undefined ? 0 : (slots.cameras.slotOf(cameraId) ?? 0);
        const { width, height } = this.size;
        const view = this.view === 'light' ? 1 : 0;
        const key = `${cameraSlot}:${shadowSlot}:${width}x${height}`;
        if (key === this.written) return;
        this.written = key;
        this.core.write(
            this.params,
            WaterViewParamsSchema.pack({ cameraSlot, shadowSlot, view, viewport: [width, height] }),
        );
    }

    /** Slot do mapa de sombra da luz que projeta (vista da luz). */
    private shadowSlot(ctx: Ctx): number | undefined {
        const caster = ctx.bound.slots.caster?.resource;
        const lightId = caster === undefined ? undefined : this.world.entityIdOfResource(caster);
        return lightId === undefined ? undefined : ctx.bound.slots.shadowMaps?.slotOf(lightId);
    }

    private releaseKernels(): void {
        const k = this.kernels;
        if (k === undefined) return;
        destroyComputeKernel(this.core, k.march);
        if (k.fit !== undefined) destroyComputeKernel(this.core, k.fit);
        this.kernels = undefined;
    }
}

function sameSources(a: readonly unknown[], b: readonly unknown[]): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}
