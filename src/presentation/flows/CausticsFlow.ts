import type {
    AnyBufferSpec,
    EngineCore,
    Frame,
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
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { World } from '../../scene/world/World';
import { FluidSurfaceMaterial } from '../../elements/material/FluidSurfaceMaterial';
import { DirectionalLight } from '../../elements/scene/DirectionalLight';
import { Light } from '../../elements/scene/Light';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { shadowMatricesResource } from '../../elements/scene/resources';
import { castingShadowMap } from '../../elements/scene/shadowCaster';
import { WaterSurface } from '../app/WaterSurface';
import { CausticParamsSchema } from '../water/schemas';
import { caustics, waterResources as R } from '../water/shaders';
import { Time } from '../../scene/time/Time';

/** Slots das cáusticas. */
export interface CausticsSlots extends SlotMap {
    /** `ShadowMap` da luz que projeta sombra (as cáusticas são dela). */
    readonly caster: SingletonSlot<true>;
    /** Mapa de sombra dela: os receptores (fundo e objetos submersos). */
    readonly shadowTexture: TextureSlot<true>;
    /** Pool `ShadowMap` (o slot do mapa). */
    readonly shadowMaps: PoolSlot<true>;
    /** Pool `ShadowMatrix` (matriz da luz). */
    readonly shadowMatrices: PoolSlot<true>;
    /** A superfície de água da cena. */
    readonly water: SingletonSlot<false>;
    /** Tempo da cena (fase das ondulações do material). */
    readonly time: SingletonSlot<false>;
}

type Ctx = TransitionContext<CausticsSlots>;

/**
 * CausticsFlow — cáusticas da água por fótons em espaço da luz (spec 017, research R7), consumidor da superfície
 * genérica vista pela luz (`lightDepth`, `lightMaterial` do `WaterSurface`) — não sabe de partículas.
 *
 * Na fase `shadow`, depois do mapa de sombra e do produtor da vista da luz: limpa os acumuladores, lança um fóton por
 * texel com água (refratado pela normal da superfície, até o receptor no mapa de sombra; energia de Fresnel × absorção
 * no percurso; depósito bilinear em ponto fixo) e resolve no mapa `caustics` — o fator de transmissão da luz que o
 * forward aplica abaixo da água. Só a luz que projeta sombra no render principal gera cáusticas; outras luzes com sombra
 * são avisadas uma vez.
 */
export class CausticsFlow extends Flow<CausticsSlots, 'idle'> {
    readonly type = 'CausticsFlow';
    readonly slots: CausticsSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly resources: ResourceDirectory;
    private readonly params: UniformBufferSpec;
    private kernels:
        | { clear: ComputeKernel; splat: ComputeKernel; resolve: ComputeKernel }
        | undefined;
    private sources: readonly unknown[] = [];
    private written = '';
    private active = false;
    private size = 0;
    private warnedLights = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.resources = ctx.resources;
        const select = castingShadowMap(ctx.world);
        this.slots = {
            caster: slot.singleton(ShadowMap.schema, { optional: true, select }),
            shadowTexture: slot.texture(ShadowMap.schema, 'depth', { optional: true, select }),
            shadowMaps: slot.pool(ShadowMap.schema.name, { optional: true }),
            shadowMatrices: slot.pool(ShadowMap.matrixSchema.name, { optional: true }),
            water: slot.singleton(WaterSurface.schema),
            time: slot.singleton(Time.schema),
        };
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'caustic_params',
            byteSize: CausticParamsSchema.stride,
        });
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepareFrame(c);
                    },
                },
            },
        };
    }

    /** Limpa, deposita e resolve. */
    dispatch(frame: Frame, bound: BoundFlow<CausticsSlots>): void {
        const kernels = this.kernels;
        if (!this.active || kernels === undefined) return;
        const water = bound.slots.water.resource as WaterSurface;
        if (!this.resources.isProduced(water, WaterSurface.producedDescriptor.light)) return;
        const n = this.size;
        frame.compute('CausticsFlow', (pass) => {
            const run = (kernel: ComputeKernel, dispatch: () => void): void => {
                pass.bind.setPipeline(kernel.pipeline);
                kernel.bindTo(pass.bind);
                dispatch();
            };
            run(kernels.clear, () => pass.dispatch.invocations(3 * n * n, WORKGROUP_SIZE.value));
            run(kernels.splat, () => pass.dispatch.workgroups(Math.ceil(n / 8), Math.ceil(n / 8)));
            run(kernels.resolve, () =>
                pass.dispatch.workgroups(Math.ceil(n / 8), Math.ceil(n / 8)),
            );
        });
    }

    /** Libera kernels e parâmetros. */
    override dispose(): void {
        this.releaseKernels();
        this.core.destroy(this.params);
    }

    /** Fontes, kernels (refeitos quando uma fonte muda) e parâmetros — antes da gravação. */
    private prepareFrame(ctx: Ctx): void {
        const slots = ctx.bound.slots;
        const water = slots.water.resource as WaterSurface;
        // Sem a superfície vista pela luz (sem água ou sem luz com sombra): nada a preparar.
        if (!this.resources.isProduced(water, WaterSurface.producedDescriptor.light)) {
            this.active = false;
            return;
        }
        const caster = slots.caster?.resource;
        const lightId = caster === undefined ? undefined : this.world.entityIdOfResource(caster);
        const shadowSlot = lightId === undefined ? undefined : slots.shadowMaps?.slotOf(lightId);
        const tex = (id: string): TextureViewSpec | undefined =>
            this.resources.textureViewOf(water, id);
        const lightDepth = tex('lightDepth');
        const lightMaterial = tex('lightMaterial');
        const out = tex('caustics');
        const photons = this.resources.bufferOf(water, 'photons');
        const lightMatrix = this.resources.bufferOf(water, 'lightMatrix');
        const materials = this.resources.poolBufferSpec(FluidSurfaceMaterial.schema.name);
        const shadow = slots.shadowTexture?.view;
        const matrices = slots.shadowMatrices?.buffer;
        this.active = false;
        if (
            shadowSlot === undefined
            || lightDepth === undefined
            || lightMaterial === undefined
            || out === undefined
            || photons === undefined
            || lightMatrix === undefined
            || materials === undefined
            || shadow === undefined
            || matrices === undefined
        ) {
            return;
        }
        this.warnExtraLights();
        this.size = water.lightSize;
        const sources = [
            lightDepth,
            lightMaterial,
            out,
            photons,
            materials,
            shadow,
            matrices,
            lightMatrix,
        ];
        if (
            this.kernels === undefined
            || sources.length !== this.sources.length
            || sources.some((s, i) => s !== this.sources[i])
        ) {
            this.releaseKernels();
            this.kernels = this.createKernels(
                lightDepth,
                lightMaterial,
                out,
                photons,
                materials,
                shadow,
                matrices,
                lightMatrix,
            );
            this.sources = sources;
        }
        const time = (slots.time.resource as Time).data.elapsed;
        const key = `${shadowSlot}:${this.size}:${time}`;
        if (key !== this.written) {
            this.written = key;
            this.core.write(
                this.params,
                CausticParamsSchema.pack({ shadowSlot, width: this.size, height: this.size, time }),
            );
        }
        this.active = true;
    }

    private createKernels(
        lightDepth: TextureViewSpec,
        lightMaterial: TextureViewSpec,
        out: TextureViewSpec,
        photons: AnyBufferSpec,
        materials: AnyBufferSpec,
        shadow: TextureViewSpec,
        matrices: AnyBufferSpec,
        lightMatrix: AnyBufferSpec,
    ): { clear: ComputeKernel; splat: ComputeKernel; resolve: ComputeKernel } {
        const kernel = (
            entryPoint: string,
            bindings: readonly (readonly [WgslResource, unknown])[],
        ): ComputeKernel =>
            createComputeKernel(this.core, {
                discriminator: `caustics_${entryPoint}`,
                shader: caustics,
                entryPoint,
                bindings: new Map(bindings) as ReadonlyMap<WgslResource, BindingSource>,
            });
        return {
            clear: kernel('caustic_clear', [
                [R.causticParams, this.params],
                [R.photons, photons],
            ]),
            splat: kernel('caustic_splat', [
                [shadowMatricesResource, matrices],
                [R.lightMatrix, lightMatrix],
                [R.materials, materials],
                [R.causticParams, this.params],
                [R.lightDepth, lightDepth],
                [R.lightMaterial, lightMaterial],
                [R.causticShadow, shadow],
                [R.photons, photons],
            ]),
            resolve: kernel('caustic_resolve', [
                [R.causticParams, this.params],
                [R.photonSums, photons],
                [R.causticOut, out],
            ]),
        };
    }

    private releaseKernels(): void {
        if (this.kernels === undefined) return;
        for (const k of Object.values(this.kernels)) destroyComputeKernel(this.core, k);
        this.kernels = undefined;
        this.sources = [];
    }

    /** Outras luzes com sombra além da que projeta no render principal: aviso único (só uma gera cáusticas). */
    private warnExtraLights(): void {
        if (this.warnedLights) return;
        const shadowed = this.world
            .queryBySchema(Light.schema)
            .filter((id) =>
                this.world
                    .resourcesOf(id)
                    .some((r) => r instanceof DirectionalLight && r.data.castShadow === 1),
            );
        if (shadowed.length <= 1) return;
        this.warnedLights = true;
        console.warn(
            `[CausticsFlow] ${shadowed.length} luzes projetam sombra: só a do render principal gera cáusticas.`,
        );
    }
}
