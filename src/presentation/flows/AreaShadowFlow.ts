import type { Frame } from '../../scene/contracts/gpu';
import type { Resource } from '../../scene/contracts/Resource';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import { Flow } from '../../scene/flows/Flow';
import { FlowWork } from '../../scene/flows/FlowWork';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
    type WorkSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { World } from '../../scene/world/World';
import { AreaShadow } from '../../elements/lighting/areaShadow/AreaShadow';
import {
    AREA_SHADOW_CHANNELS,
    AREA_SHADOW_TARGETS,
} from '../../elements/lighting/areaShadow/areaShadowSchema';
import {
    areaShadow,
    areaShadowResources,
    AreaShadowParamsSchema,
    areaShadowSlots,
} from '../../elements/lighting/areaShadow/shaders';
import { RayScene } from '../../elements/raytrace/RayScene';
import { Camera } from '../../elements/scene/Camera';
import { Light } from '../../elements/scene/Light';
import { FrameTargets } from '../app/FrameTargets';

/** Slots da sombra das luzes de área. */
export interface AreaShadowSlots extends SlotMap {
    /** O `AreaShadow` da cena (sem ele, nada). */
    readonly areaShadow: SingletonSlot<true>;
    /** A média no tempo e o ponto com os quadros (canais temporais, spec 037). */
    readonly areaShadowAccumulated: ChannelSlot<true>;
    readonly areaShadowHistory: ChannelSlot<true>;
    /** A profundidade da cena deste quadro. */
    readonly sceneDepth: TextureSlot<true>;
    /** A câmera ativa e o pool das matrizes. */
    readonly camera: SingletonSlot<true>;
    readonly cameras: PoolSlot<true>;
    /** O pool das luzes (o retângulo de cada luz de área). */
    readonly lights: PoolSlot<true>;
    /** A estrutura de raios da cena. */
    readonly rays: SingletonSlot<true>;
    readonly work: WorkSlot<AreaShadowWork>;
}

const PARAMS = 'area_shadow_params';

/** Resource de trabalho: os parâmetros do quadro. */
class AreaShadowWork extends FlowWork {
    static readonly schema = new StructSchema('AreaShadowWork', {});
    constructor() {
        super();
        this.use({
            descriptors: () => [
                { id: PARAMS, role: 'uniform', schema: AreaShadowParamsSchema, upload: 'never' },
            ],
        });
    }
}

type Ctx = TransitionContext<AreaShadowSlots>;

const R = areaShadowResources;
/** Quadros da média temporal da sombra de uma luz que está mudando, e por quantos quadros depois da última mudança. */
const MOVING_HISTORY = 2;
const MOVING_FRAMES = 4;
const TEMPORAL = 'area_shadow:temporal';
const ATROUS_A = 'area_shadow:atrous_a';
const ATROUS_B = 'area_shadow:atrous_b';

/**
 * AreaShadowFlow — a sombra das luzes de área por raios (spec 013, R5). Depois do desenho, a meia resolução: da
 * profundidade da cena deste quadro, um raio por texel e por luz a um ponto sorteado no retângulo
 * (`area_shadow_trace`); a média no tempo pelo ponto de mundo, nos canais temporais do `AreaShadow`
 * (`area_shadow_temporal`); e duas passadas do filtro guiado (`area_shadow_atrous_*`) até `output`, que o desenho do
 * quadro seguinte lê pelo ponto de mundo de cada fragmento. Sem `AreaShadow` na cena (nenhuma luz de área com sombra),
 * sem câmera, sem profundidade ou sem a estrutura de raios, nada é gravado.
 */
export class AreaShadowFlow extends Flow<AreaShadowSlots, 'idle'> {
    readonly type = 'AreaShadowFlow';
    readonly slots: AreaShadowSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly work = new AreaShadowWork();
    /** O pipeline do traçado preparado (pelas amostras da profundidade) e se os do filtro já foram pedidos. */
    private trace: string | undefined;
    private filtered = false;
    /** O que está ligado (outros = religa). */
    private bound: readonly unknown[] = [];
    private active = false;
    /** O tamanho dos alvos (meia resolução). */
    private width = 0;
    private height = 0;
    /** Quadros traçados (a posição da sequência do sorteio). */
    private frame = 0;
    /** A forma de cada luz no último quadro e os quadros que faltam com a média curta (a luz mudou há pouco). */
    private shapes: (string | undefined)[] = [];
    private fresh: number[] = [];

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.world = ctx.world;
        const work = this.work;
        this.slots = {
            areaShadow: slot.singleton(AreaShadow.schema, { optional: true }),
            ...areaShadowSlots,
            sceneDepth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
            camera: slot.singleton(Camera.schema, { optional: true }),
            cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
            lights: slot.pool(Light.schema.name, { optional: true }),
            rays: slot.singleton(RayScene.schema, { optional: true }),
            work: slot.work(() => work),
        };
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                entitiesChanged: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.active = this.prepare(c);
                    },
                },
            },
        };
    }

    /** O traçado, a média no tempo e as duas passadas do filtro. */
    dispatch(frame: Frame, bound: BoundFlow<AreaShadowSlots>): void {
        if (!this.active || this.trace === undefined) return;
        const ids = [this.trace, TEMPORAL, ATROUS_A, ATROUS_B];
        const pipelines = ids.map((id) => bound.pipelines.get(id));
        if (pipelines.some((p) => p?.role !== 'compute' || !p.ready)) return;
        const x = Math.ceil(this.width / 8);
        const y = Math.ceil(this.height / 8);
        const run = (label: string, k: number): void => {
            const p = pipelines[k];
            if (p?.role !== 'compute') return;
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(p.spec);
                p.bindTo(pass.bind);
                pass.dispatch.workgroups(x, y);
            });
        };
        run('AreaShadowFlow.trace', 0);
        run('AreaShadowFlow.temporal', 1);
        // O que o quadro seguinte lê como histórico: a média sem o filtro espacial e o ponto com os quadros.
        bound.slots.areaShadowAccumulated?.written();
        bound.slots.areaShadowHistory?.written();
        run('AreaShadowFlow.atrous_a', 2);
        run('AreaShadowFlow.atrous_b', 3);
    }

    /** Aloca os alvos, escreve os parâmetros do quadro, liga as fontes e pede os pipelines. Devolve se há o que traçar. */
    private prepare(c: Ctx): boolean {
        const s = c.bound.slots;
        const shadow = s.areaShadow?.resource as AreaShadow | undefined;
        const depth = s.sceneDepth;
        const camera = s.camera?.resource;
        if (shadow === undefined || depth === undefined || camera === undefined) return false;
        if (s.rays === undefined || s.lights === undefined) return false;
        const cameraId = this.world.entityIdOfResource(camera);
        const cameraSlot = cameraId === undefined ? undefined : s.cameras?.slotOf(cameraId);
        if (cameraSlot === undefined) return false;
        const lightSlots: number[] = [];
        for (const light of shadow.lights) {
            const id = this.world.entityIdOfResource(light);
            const at = id === undefined ? undefined : s.lights.slotOf(id);
            // A luz ainda sem slot: o canal dela fica sem traçado neste quadro (os seguintes não mudam de canal).
            if (at === undefined) return false;
            lightSlots.push(at);
        }
        if (lightSlots.length === 0) return false;
        // A luz que mudou (lugar, direção, tamanho): o histórico da sombra dela não vale; a média fica curta enquanto
        // ela muda e por alguns quadros depois.
        shadow.lights.forEach((light, k) => {
            const d = light.data;
            const key = `${d.position.join()}|${d.direction.join()}|${d.axis.join()}|${d.cones[0]},${d.cones[1]}`;
            if (this.shapes[k] !== undefined && this.shapes[k] !== key)
                this.fresh[k] = MOVING_FRAMES;
            else this.fresh[k] = Math.max(0, (this.fresh[k] ?? 0) - 1);
            this.shapes[k] = key;
        });
        for (const id of [...AREA_SHADOW_TARGETS, ...AREA_SHADOW_CHANNELS])
            this.resources.ensureAllocated(shadow, id);
        if (shadow.data.camera !== cameraSlot) shadow.data.camera = cameraSlot;
        const view = (r: Resource, id: string): BindingSource | undefined =>
            this.resources.textureViewOf(r, id);
        const [traced, point, work, output] = AREA_SHADOW_TARGETS.map((id) => view(shadow, id));
        const params = this.resources.bufferOf(this.work, PARAMS);
        if (
            traced === undefined
            || point === undefined
            || work === undefined
            || output === undefined
            || params === undefined
        )
            return false;
        if (s.areaShadowAccumulated === undefined || s.areaShadowHistory === undefined)
            return false;
        const size = this.resources.textureOf(shadow, 'traced');
        if (size === undefined) return false;
        this.width = size.width;
        this.height = size.height;
        this.frame = (this.frame + 1) >>> 0;
        this.resources.writeNow(
            this.work,
            PARAMS,
            AreaShadowParamsSchema.pack({
                cameraSlot,
                count: lightSlots.length,
                frame: this.frame,
                _pad0: 0,
                lights: [0, 1, 2, 3].map((k) => lightSlots[k] ?? 0),
                history: [0, 1, 2, 3].map((k) =>
                    (this.fresh[k] ?? 0) > 0 ? MOVING_HISTORY : shadow.data.history_max,
                ),
            }),
        );
        const multisampled = (depth.texture.sampleCount ?? 1) > 1;
        const sources = [depth.view, params, traced, point, work, output, multisampled];
        if (sources.some((v, k) => v !== this.bound[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [multisampled ? R.depthMs : R.depth, depth.view],
                    [R.params, params as BindingSource],
                    [R.tracedOut, traced],
                    [R.pointOut, point],
                    [R.traced, traced],
                    [R.point, point],
                    [R.workOut, work],
                    [R.work, work],
                    [R.outputOut, output],
                ]),
            );
            this.bound = sources;
        }
        const id = `area_shadow:trace:${multisampled ? 'ms' : '1'}`;
        if (id !== this.trace) {
            if (this.trace !== undefined) c.release(this.trace);
            this.trace = id;
            c.prepare({
                id,
                role: 'compute',
                shader: multisampled ? areaShadow.traceMs : areaShadow.trace,
                entryPoints: ['area_shadow_trace_main'],
            });
        }
        if (!this.filtered) {
            this.filtered = true;
            c.prepare({
                id: TEMPORAL,
                role: 'compute',
                shader: areaShadow.temporal,
                entryPoints: ['area_shadow_temporal_main'],
            });
            c.prepare({
                id: ATROUS_A,
                role: 'compute',
                shader: areaShadow.atrousA,
                entryPoints: ['area_shadow_atrous_a_main'],
            });
            c.prepare({
                id: ATROUS_B,
                role: 'compute',
                shader: areaShadow.atrousB,
                entryPoints: ['area_shadow_atrous_b_main'],
            });
        }
        return true;
    }
}
