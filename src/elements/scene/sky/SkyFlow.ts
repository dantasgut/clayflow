import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, TextureViewSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { World } from '../../../scene/world/World';
import { Light } from '../Light';
import { Sky, SKY_MULTISCATTER_SIZE, SKY_TRANSMITTANCE_SIZE, SKY_VIEW_SIZE } from './Sky';
import {
    skyMultiscatterKernel,
    skyOutputs,
    skyTransmittanceKernel,
    skyViewKernel,
} from './shaders';

/** Slots do estágio do céu. */
export interface SkySlots extends SlotMap {
    /** O céu da cena. */
    readonly sky: SingletonSlot<false>;
}

const slots: SkySlots = { sky: slot.singleton(Sky.schema) };

type Ctx = TransitionContext<SkySlots>;

const TRANSMITTANCE: PipelineDescriptor = {
    id: 'sky_transmittance',
    role: 'compute',
    shader: skyTransmittanceKernel,
    entryPoints: ['sky_transmittance_main'],
};
const MULTISCATTER: PipelineDescriptor = {
    id: 'sky_multiscatter',
    role: 'compute',
    shader: skyMultiscatterKernel,
    entryPoints: ['sky_multiscatter_main'],
};
const VIEW: PipelineDescriptor = {
    id: 'sky_view',
    role: 'compute',
    shader: skyViewKernel,
    entryPoints: ['sky_view_main'],
};

/** Campos da atmosfera que, mudando, regeneram as tabelas de transmitância e de múltiplo espalhamento. */
const ATMOSPHERE_FIELDS = ['rayleigh', 'mie', 'ozone', 'radii', 'ground'] as const;

/**
 * Estágio do céu físico (spec 033, R4): a cada quadro copia do sol (`DirectionalLight` do `Sky`) a direção (para ele), a
 * iluminância e o slot no pool `Light` para os parâmetros do céu; regenera a transmitância e o múltiplo espalhamento
 * quando a atmosfera muda (e na primeira vez) e a vista do céu a cada quadro (o sol se move sem recompilar nada). Fase
 * `transform`, antes da iluminação global e do desenho.
 */
export class SkyFlow extends Flow<SkySlots, 'idle'> {
    readonly type = 'SkyFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    /** Texturas ligadas às saídas (outras = religa e regenera). */
    private bound: readonly (TextureViewSpec | undefined)[] = [];
    /** Chave da atmosfera das tabelas geradas. */
    private atmosphere = '';
    /** Regenerar as tabelas da atmosfera neste quadro. */
    private tables = false;
    private ready = false;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /** Grava as tabelas da atmosfera (quando mudou) e a vista do céu. */
    dispatch(frame: Frame, bound: BoundFlow<SkySlots>): void {
        if (!this.ready) return;
        const run = (
            descriptor: PipelineDescriptor,
            [w, h]: readonly [number, number],
        ): boolean => {
            const p = bound.pipelines.get(descriptor.id);
            if (p?.role !== 'compute' || !p.ready) return false;
            frame.compute(`SkyFlow.${descriptor.id}`, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.dispatch.invocations(w * h, WORKGROUP_SIZE.value);
            });
            return true;
        };
        if (this.tables) {
            if (
                !run(TRANSMITTANCE, SKY_TRANSMITTANCE_SIZE)
                || !run(MULTISCATTER, SKY_MULTISCATTER_SIZE)
            )
                return;
            this.tables = false;
        }
        run(VIEW, SKY_VIEW_SIZE);
    }

    /** Liga as saídas às texturas do céu, copia o sol e decide se as tabelas da atmosfera são regeneradas. */
    private prepare(c: Ctx): void {
        const sky = c.bound.slots.sky.resource as Sky;
        const views = (['transmittance', 'multiscatter', 'view'] as const).map((id) =>
            c.bound.slots.sky.textureViewOf(id),
        );
        if (views.some((v) => v === undefined)) return;
        if (views.some((v, k) => v !== this.bound[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [skyOutputs.transmittance, views[0]!],
                    [skyOutputs.multiscatter, views[1]!],
                    [skyOutputs.view, views[2]!],
                ]),
            );
            // Preparados depois da primeira ligação (as saídas são privadas e só existem com o céu).
            if (this.bound.length === 0)
                for (const d of [TRANSMITTANCE, MULTISCATTER, VIEW]) c.prepare(d);
            this.bound = views;
            this.atmosphere = '';
        }
        this.syncSun(sky);
        const raw = sky.data;
        const key = JSON.stringify(ATMOSPHERE_FIELDS.map((f) => raw[f]));
        if (key !== this.atmosphere) {
            this.atmosphere = key;
            this.tables = true;
        }
        this.ready = true;
    }

    /** Direção para o sol, iluminância (cor × lux) e slot da luz — escritos só quando mudam. */
    private syncSun(sky: Sky): void {
        const light = sky.sun.data;
        const d = light.direction;
        const len = Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0) || 1;
        const direction = [-(d[0] ?? 0) / len, -(d[1] ?? -1) / len, -(d[2] ?? 0) / len, 0];
        const c = light.color;
        const raw = sky.data;
        const illuminance = [
            (c[0] ?? 1) * light.intensity,
            (c[1] ?? 1) * light.intensity,
            (c[2] ?? 1) * light.intensity,
            raw.sunIlluminance[3] ?? 0,
        ];
        const id = this.world.entityIdOfResource(sky.sun);
        const slotOf =
            id === undefined ? undefined : this.resources.poolSlotOf(Light.schema.name, id);
        const sunSlot = slotOf ?? NONE.value;
        const same = (a: readonly number[], b: readonly number[]): boolean =>
            a.every((v, k) => v === b[k]);
        if (!same(direction, raw.sunDirection)) sky.data.sunDirection = direction;
        if (!same(illuminance, raw.sunIlluminance)) sky.data.sunIlluminance = illuminance;
        if (sunSlot !== raw.sunSlot) sky.data.sunSlot = sunSlot;
    }
}
