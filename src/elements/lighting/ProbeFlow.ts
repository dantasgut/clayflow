import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    TextureViewSpec,
} from '../../scene/contracts/gpu';
import type { EventBus } from '../../scene/events/EventBus';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../scene/flows/Flow';
import { FlowWork, type WorkContext } from '../../scene/flows/FlowWork';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import { StructSchema } from '../../scene/descriptors/StructSchema';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../scene/flows/slots';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Time } from '../../scene/time/Time';
import type { World } from '../../scene/world/World';
import { RayScene } from '../raytrace/RayScene';
import { wordBuffer } from '../gpu/compute/schemas';
import { RayWave } from '../raytrace/RayWave';
import { PerStepUniforms } from '../gpu/compute/PerStepUniforms';
import { Camera } from '../scene/Camera';
import { Light } from '../scene/Light';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { Transform } from '../scene/Transform';
import { pcgHash } from '../math/reference/random';
import { GlobalIllumination } from './GlobalIllumination';
import { Caustics } from './caustics/Caustics';
import {
    GI_GRID,
    GI_IRRADIANCE_TEXELS,
    GI_MAX_PROBES,
    GI_SCREEN_TILE_MIN,
    GI_VISIBILITY_TEXELS,
    GiScreenFilterStepSchema,
} from './schemas';
import {
    giProbeAtlas,
    giProbeBlend,
    giProbeClassify,
    giProbeTrace,
    giResources as R,
    giScreenResolve,
    giScreenTrace,
    giScreenHistorySlot,
    giWaveDirect,
} from './shaders';

/** Slots do estágio das sondas. */
export interface ProbeSlots extends SlotMap {
    /** A iluminação global da cena. */
    readonly gi: SingletonSlot<false>;
    /** A estrutura de raios (os raios das sondas). */
    readonly rays: SingletonSlot<false>;
    /** A câmera ativa (o centro das cascatas). */
    readonly camera: SingletonSlot<true>;
    /** O tempo simulado (a amostra de superfície dos materiais nos acertos). */
    readonly time: SingletonSlot<true>;
    /** As matrizes das câmeras (o slot da câmera ativa, para a coleta final na tela). */
    readonly cameras: PoolSlot<true>;
    /** O histórico das sondas de tela: um canal temporal (spec 037), reservado pelo estágio para o alvo. */
    readonly giScreenHistory: ChannelSlot<false>;
    /** As cáusticas (spec 034): com elas ativas, as sondas não leem o especular direto de vidro e metal liso. */
    readonly caustics: SingletonSlot<true>;
    /** O espaço de trabalho das sondas: raios, gerações, radiância, visibilidade, a coleta de tela, a onda (spec 039). */
    readonly work: WorkSlot<ProbeWork>;
}

/** Resource de trabalho do `ProbeFlow` (spec 039). */
class ProbeWork extends FlowWork {
    static readonly schema = new StructSchema('ProbeWork', {});
}

type Ctx = TransitionContext<ProbeSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const BLEND_IRRADIANCE = compute('gi_blend_irradiance', giProbeBlend, 'gi_blend_irradiance_main');
const BLEND_VISIBILITY = compute('gi_blend_visibility', giProbeBlend, 'gi_blend_visibility_main');
/** A histerese de cada sonda atualizada, antes do acúmulo (spec 034, T049: o estado da resposta lido e gravado uma vez). */
const BLEND_RESPONSE = compute('gi_blend_response', giProbeBlend, 'gi_blend_response_main');
const CLASSIFY = compute('gi_classify', giProbeClassify, 'gi_probe_classify_main');
const ATLAS_IRRADIANCE = compute('gi_atlas_irradiance', giProbeAtlas, 'gi_atlas_irradiance_main');
const ATLAS_VISIBILITY = compute('gi_atlas_visibility', giProbeAtlas, 'gi_atlas_visibility_main');
const ATLAS_PROBES = compute('gi_atlas_probes', giProbeAtlas, 'gi_atlas_probes_main');
const SCREEN_RESOLVE = compute('gi_screen_resolve', giScreenResolve, 'gi_screen_resolve_main');
const SCREEN_FILTER = compute('gi_screen_filter', giScreenResolve, 'gi_screen_filter_main');
const FIXED = [
    BLEND_IRRADIANCE,
    BLEND_VISIBILITY,
    CLASSIFY,
    ATLAS_IRRADIANCE,
    ATLAS_VISIBILITY,
    ATLAS_PROBES,
    SCREEN_RESOLVE,
    SCREEN_FILTER,
    BLEND_RESPONSE,
];
/** vec4f por sonda de tela no histórico além das gerações (posição, normal, estado da resposta). */
const SCREEN_HISTORY_FIXED = 3;
/**
 * Os raios das sondas do mundo e de tela (spec 039): o acerto de cada raio na onda e, depois do material avaliado por
 * classe, a luz que volta — sem as funções `material` nos kernels.
 */
const PROBE_HIT = compute('gi_probe_hit', giProbeTrace, 'gi_probe_hit_main');
const PROBE_TRACE = compute('gi_trace', giProbeTrace, 'gi_probe_trace_main');
const SCREEN_HIT = compute('gi_screen_hit', giScreenTrace, 'gi_screen_hit_main');
const SCREEN_TRACE = compute('gi_screen_trace', giScreenTrace, 'gi_screen_trace_main');
/**
 * A luz direta nos acertos da onda e os fatores do fechamento (spec 034 T078), numa rodada com os raios das sondas do
 * mundo e os de tela: os kernels que somam os rebatimentos não ligam as luzes, a estrutura de raios nem os contribuintes
 * da luz, nem leem o fechamento.
 */
const WAVE_DIRECT = compute('gi_wave_direct', giWaveDirect, 'gi_wave_direct_main');
const TRACES = [PROBE_HIT, PROBE_TRACE, SCREEN_HIT, SCREEN_TRACE, WAVE_DIRECT];

/** Os passes do filtro à-trous das sondas de tela (T054): passo em ladrilhos; ida e volta entre as duas metades. */
const FILTER_STEPS = [1, 2, 4] as const;

/** Vieses do ponto amostrado (frações do espaçamento): pela normal e pela vista (DDGI). */
const NORMAL_BIAS = 0.1;
const VIEW_BIAS = 0.3;
/**
 * Ligações de storage que o kernel mais carregado usa sem contribuintes (o acerto dos raios das sondas de tela: os dois
 * pools da estrutura, as matrizes das câmeras, o trabalho e o histórico da tela, a onda e as contagens dela); a luz
 * direta nos acertos é um kernel à parte (`gi_wave_direct_main`: as luzes, a estrutura, a onda e a saída, mais os
 * contribuintes da luz), e os que somam os rebatimentos não ligam nenhum deles (spec 034 T078). Os contribuintes de
 * cada cena (volumes, cáusticas) a C2 confere na preparação contra o que o adaptador concede.
 */
const STORAGE_BINDINGS_NEEDED = 7;

/** Tamanhos dos buffers privados (outros = buffers novos e religados). */
interface Sizes {
    readonly probes: number;
    readonly updated: number;
    readonly rays: number;
    readonly bounces: number;
    /** Ladrilhos da coleta final na tela (x, y; 0 sem ela) e raios por sonda de tela. */
    readonly tilesX: number;
    readonly tilesY: number;
    readonly screenRays: number;
    /** Pixels por lado do ladrilho no alvo atual. */
    readonly tile: number;
}

/** Buffers privados das sondas. */
interface Buffers {
    readonly sizes: Sizes;
    readonly rays: StorageBufferSpec;
    readonly generations: StorageBufferSpec;
    readonly radiance: StorageBufferSpec;
    readonly visibility: StorageBufferSpec;
    readonly screenWork: StorageBufferSpec;
    readonly waveDirect: StorageBufferSpec;
    readonly hysteresis: StorageBufferSpec;
    readonly screenFilter: StorageBufferSpec;
}

/**
 * Pixels por lado do ladrilho das sondas de tela num alvo de `height` pixels: o da autoria vale para 1080 linhas e
 * dobra a cada dobro da altura (a mesma resolução angular: 4 px em 1080p, 8 px em 4K), nunca abaixo do menor.
 */
export function screenTile(authored: number, height: number): number {
    const scale = 2 ** Math.max(0, Math.round(Math.log2(height / 1080)));
    return Math.max(GI_SCREEN_TILE_MIN, authored * scale);
}

/** Gerador determinístico (hash PCG) em [0, 1). */
const random = (seed: number): number => pcgHash(seed >>> 0) / 4294967296;

/** Rotação aleatória (uniforme, de um quatérnio de Shoemake) do quadro `n`: as três linhas. */
function frameRotation(n: number): number[][] {
    const u1 = random(n * 3 + 1);
    const u2 = random(n * 3 + 2) * 2 * Math.PI;
    const u3 = random(n * 3 + 3) * 2 * Math.PI;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    const [x, y, z, w] = [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y), 0],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x), 0],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y), 0],
    ];
}

/**
 * ProbeFlow — as sondas da iluminação global (spec 033, R2/R5/R6). A cada quadro: as cascatas centradas na câmera
 * (endereçamento circular), a fração das sondas atualizada (em rodízio) e a rotação dos raios; grava num passe os raios
 * das sondas pela estrutura de raios (acertos sombreados com o material da entidade, a luz direta com raio de sombra e
 * o rebatimento anterior; os que escapam leem o ambiente), o acúmulo nos mapas (irradiância de cada rebatimento,
 * radiância especular, visibilidade) com histerese, o estado das sondas (dentro da geometria, relocação) e a cópia para
 * os atlas filtrados que o desenho lê. Os materiais por função da cena são compostos no kernel dos raios; uma mudança
 * no conjunto prepara um kernel novo, que entra quando compila. Fase `shadow` (depois da estrutura de raios e do céu).
 */
export class ProbeFlow extends Flow<ProbeSlots, 'idle'> {
    readonly type = 'ProbeFlow';
    readonly slots: ProbeSlots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly work: WorkContext;
    private readonly world: World;
    private readonly events: EventBus;
    private readonly resources: ResourceDirectory;
    private sizes: Sizes | undefined;
    private atlases: readonly (TextureViewSpec | undefined)[] = [];
    private prepared = false;
    /** A onda dos acertos dos raios (o material fora do traçado): os das sondas do mundo e, depois deles, os das de tela. */
    private readonly wave: RayWave;
    /** Os passes do filtro à-trous das sondas de tela (T054): o passo e as metades por região, por offset dinâmico. */
    private readonly filterSteps: PerStepUniforms;
    private materialRevision = -1;
    /** Revisão já anunciada pronta (`globalIlluminationReady`). */
    private announcedRevision = -1;
    private frame = 0;
    private active = false;
    /** Coleta final na tela no quadro (ligada, com câmera e com o canvas). */
    private screenActive = false;
    private unsupported = false;

    constructor(ctx: FlowContext) {
        super();
        const work = new ProbeWork();
        this.work = { core: ctx.core, resources: ctx.resources, work };
        this.slots = {
            gi: slot.singleton(GlobalIllumination.schema),
            rays: slot.singleton(RayScene.schema),
            camera: slot.singleton(Camera.schema, { optional: true }),
            time: slot.singleton(Time.schema, { optional: true }),
            cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
            ...giScreenHistorySlot,
            caustics: slot.singleton(Caustics.schema, { optional: true }),
            work: slot.work(() => work),
        };
        this.world = ctx.world;
        this.events = ctx.events;
        this.resources = ctx.resources;
        work.use({ descriptors: () => this.bufferDescriptors() });
        this.wave = new RayWave(this.work, 'gi');
        this.filterSteps = new PerStepUniforms(this.work, {
            id: 'gi_screen_filter_step',
            schema: GiScreenFilterStepSchema,
        });
        this.filterSteps.reserve(FILTER_STEPS.length);
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
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /**
     * Raios, acúmulo, estado e atlas das sondas atualizadas e, com a coleta final na tela, a colocação, os raios e o
     * acúmulo das sondas de tela, num passe.
     */
    dispatch(frame: Frame, bound: BoundFlow<ProbeSlots>): void {
        if (!this.active || this.buffers === undefined) return;
        const traces = TRACES.map((d) => bound.pipelines.get(d.id));
        const fixed = FIXED.map((d) => bound.pipelines.get(d.id));
        if (
            [...traces, ...fixed].some((p) => p?.role !== 'compute' || !p.ready)
            || !this.wave.ready(bound)
        )
            return;
        const { updated, rays, tilesX, tilesY, screenRays } = this.buffers.sizes;
        const tiles = this.screenActive ? tilesX * tilesY : 0;
        const run = (
            pass: Parameters<Parameters<Frame['compute']>[1]>[0],
            k: number,
            count: number,
            size: number,
        ): void => {
            const p = k < 0 ? traces[-k - 1] : fixed[k];
            if (p?.role !== 'compute' || count === 0) return;
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(count, size);
        };
        const W = WORKGROUP_SIZE.value;
        frame.compute('ProbeFlow', (pass) => {
            // A rodada única da onda: os acertos das sondas do mundo com a colocação das sondas de tela na mesma despacho
            // (os raios longos da câmera, poucos, sozinhos deixariam a GPU ociosa), depois os acertos das de tela, o
            // material por classe e a luz direta de todos.
            this.wave.reset(pass, bound);
            run(pass, -1, updated * rays + tiles, W);
            run(pass, -3, tiles * screenRays, W);
            this.wave.shade(pass, bound);
            // A luz direta com uma invocação por raio (os raios de sombra: o trabalho que mais pede invocações em voo).
            run(pass, -5, updated * rays + tiles * screenRays, W);
            run(pass, -2, updated * rays, W);
            // A histerese por sonda antes do acúmulo: todos os texels da sonda leem a mesma (T049).
            run(pass, 8, updated, W);
            run(pass, 0, updated * GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS, W);
            run(pass, 1, updated * GI_VISIBILITY_TEXELS * GI_VISIBILITY_TEXELS, W);
            run(pass, 2, updated, W);
            run(pass, 3, updated * (GI_IRRADIANCE_TEXELS + 2) ** 2, W);
            run(pass, 4, updated * (GI_VISIBILITY_TEXELS + 2) ** 2, W);
            run(pass, 5, updated, W);
            // Os rebatimentos das sondas de tela leem as sondas do mundo já acumuladas no quadro.
            run(pass, -4, tiles * screenRays, W);
            run(pass, 6, tiles, W);
            // O filtro à-trous em três passes (passos 1, 2 e 4), cada um na sua região do uniforme (T054).
            const filter = fixed[7];
            if (filter?.role === 'compute' && tiles > 0) {
                pass.bind.setPipeline(filter.spec);
                FILTER_STEPS.forEach((_, k) => {
                    filter.bindTo(pass.bind, { draw: [this.filterSteps.offset(k)] });
                    pass.dispatch.invocations(tiles, W);
                });
            }
        });
        // O acúmulo escreveu a fatia do quadro do histórico: o quadro seguinte a lê como a anterior (o canal gira).
        if (tiles > 0) bound.slots.giScreenHistory.written();
        this.frame++;
    }

    private get core(): EngineCore {
        return this.work.core;
    }

    /** Os buffers das sondas no Resource de trabalho, pelos tamanhos atuais (spec 039). */
    private bufferDescriptors(): readonly GPUDescriptor[] {
        const sizes = this.sizes;
        if (sizes === undefined) return [];
        const texels = GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS;
        return [
            wordBuffer('gi_probes:rays', sizes.updated * sizes.rays * sizes.bounces * 16),
            wordBuffer('gi_probes:generations', GI_MAX_PROBES * texels * sizes.bounces * 8),
            wordBuffer('gi_probes:radiance', GI_MAX_PROBES * texels * 8),
            wordBuffer(
                'gi_probes:visibility',
                GI_MAX_PROBES * GI_VISIBILITY_TEXELS * GI_VISIBILITY_TEXELS * 4,
            ),
            // Coleta final na tela: por sonda de tela, posição e normal e a irradiância do quadro de cada geração (o
            // histórico, de 3 + gerações vec4f por sonda, é o canal temporal `GlobalIllumination.screenHistory`).
            wordBuffer(
                'gi_probes:screenWork',
                sizes.tilesX * sizes.tilesY * (2 + sizes.bounces) * 16,
            ),
            // A luz direta nos acertos da onda e os fatores do fechamento (três vec4f), por raio da rodada (spec 034 T078).
            wordBuffer('gi_probes:waveDirect', this.waveRays(sizes) * 48),
            // A histerese de cada sonda atualizada no quadro (spec 034, T049).
            wordBuffer('gi_probes:hysteresis', Math.max(4, sizes.updated) * 4),
            // O filtro à-trous das sondas de tela: duas metades de ida e volta, vec4f por sonda (T054).
            wordBuffer('gi_probes:screenFilter', Math.max(1, sizes.tilesX * sizes.tilesY) * 2 * 16),
        ];
    }

    /** Os buffers que a C2 alocou para as sondas (ou `undefined` antes do primeiro dimensionamento). */
    private get buffers(): Buffers | undefined {
        const sizes = this.sizes;
        if (sizes === undefined) return undefined;
        const of = (name: string): StorageBufferSpec =>
            this.resources.bufferOf(this.work.work, `gi_probes:${name}`) as StorageBufferSpec;
        return {
            sizes,
            rays: of('rays'),
            generations: of('generations'),
            radiance: of('radiance'),
            visibility: of('visibility'),
            screenWork: of('screenWork'),
            waveDirect: of('waveDirect'),
            hysteresis: of('hysteresis'),
            screenFilter: of('screenFilter'),
        };
    }

    private prepare(c: Ctx): void {
        if (this.unsupported) return;
        const gi = c.bound.slots.gi.resource as GlobalIllumination;
        const d = gi.data;
        try {
            gi.validate();
        } catch (e) {
            console.warn(
                `[GlobalIllumination] ${(e as Error).message} — mantidos os valores anteriores.`,
            );
            return;
        }
        const storageLimit = this.core.capabilities().limits.maxStorageBuffersPerShaderStage;
        if (storageLimit !== undefined && storageLimit < STORAGE_BINDINGS_NEEDED) {
            this.unsupported = true;
            this.events.emit('globalIlluminationUnsupported', {
                reason: `o dispositivo liga menos de ${STORAGE_BINDINGS_NEEDED} buffers de storage por estágio`,
            });
            return;
        }
        // As luzes nos acertos: o pool existe mesmo sem nenhuma luz na cena (só emissores ou só o céu).
        this.resources.ensurePool(Light.schema);
        const views = (
            [
                'irradiance',
                'radiance',
                'visibility',
                'probeTexture',
                'screenProbe',
                'screenIrradiance',
            ] as const
        ).map((id) => c.bound.slots.gi.textureViewOf(id));
        if (views.some((v) => v === undefined)) return;
        const probes = GI_GRID[0] * GI_GRID[1] * GI_GRID[2] * d.cascades;
        const canvas = this.core.canvasSize();
        const tile = screenTile(d.screenTile, canvas?.height ?? 1080);
        const sizes: Sizes = {
            probes,
            updated: Math.min(probes, Math.max(1, Math.ceil(probes * d.probeFraction))),
            rays: d.raysPerProbe,
            bounces: d.bounces,
            tilesX: canvas === undefined ? 0 : Math.max(1, Math.ceil(canvas.width / tile)),
            tilesY: canvas === undefined ? 0 : Math.max(1, Math.ceil(canvas.height / tile)),
            tile,
            screenRays: d.screenRays,
        };
        // O histórico das sondas de tela (o canal): uma fatia de 3 + gerações vec4f por ladrilho; os raios das sondas do
        // mundo também o leem (a luz das superfícies visíveis), com ou sem a coleta final.
        gi.reserveScreenHistory(
            sizes.tilesX * sizes.tilesY * (SCREEN_HISTORY_FIXED + sizes.bounces),
        );
        this.resources.ensureAllocated(gi, 'screenHistory');
        const sameSizes =
            this.buffers !== undefined
            && (Object.keys(sizes) as (keyof Sizes)[]).every(
                (k) => sizes[k] === this.buffers!.sizes[k],
            );
        const sameViews = views.every((v, k) => v === this.atlases[k]);
        if (!sameSizes || !sameViews) {
            if (!sameSizes) this.allocate(sizes);
            this.atlases = views;
            this.bind(c, views as TextureViewSpec[]);
            if (!this.prepared) {
                for (const p of FIXED) c.prepare(p);
                this.prepared = true;
            }
        }
        this.syncTrace(c, c.bound.slots.rays.resource as RayScene);
        const cameraSlot = this.cameraSlot(c);
        this.screenActive =
            d.enabled
            && d.lightPath
            && d.screenGather
            && cameraSlot !== undefined
            && sizes.tilesX > 0;
        this.writeParams(c, gi, sizes, cameraSlot ?? 0);
        // Desligada pela autoria ou nos caminhos de luz do `Renderer` (T079): nada roda.
        this.active = d.enabled && d.lightPath;
    }

    /** Os buffers nos tamanhos dados: a C2 os realoca (o histórico das sondas recomeça). */
    private allocate(sizes: Sizes): void {
        this.sizes = sizes;
        this.work.work.refresh();
    }

    /** Liga os buffers privados e as saídas dos atlas. */
    private bind(c: Ctx, views: readonly TextureViewSpec[]): void {
        const b = this.buffers!;
        c.bind(
            new Map<WgslResource, BindingSource>([
                [R.rays, b.rays],
                [R.raysRead, b.rays],
                [R.generations, b.generations],
                [R.generationsRead, b.generations],
                [R.radianceMap, b.radiance],
                [R.radianceMapRead, b.radiance],
                [R.probeHysteresis, b.hysteresis],
                [R.screenFilter, b.screenFilter],
                [R.screenFilterStep, this.filterSteps.source()],
                [R.visibilityMap, b.visibility],
                [R.visibilityMapRead, b.visibility],
                [R.irradianceOut, views[0]!],
                [R.radianceOut, views[1]!],
                [R.visibilityOut, views[2]!],
                [R.probeOut, views[3]!],
                [R.screenProbeOut, views[4]!],
                [R.screenIrradianceOut, views[5]!],
                [R.screenWork, b.screenWork],
                [R.screenWorkRead, b.screenWork],
                [R.waveDirect, b.waveDirect],
                [R.waveDirectRead, b.waveDirect],
            ]),
        );
    }

    /** Raios da onda: os das sondas do mundo e, depois deles, os das sondas de tela (uma rodada, spec 034 T078). */
    private waveRays(sizes: Sizes): number {
        return Math.max(
            1,
            sizes.updated * sizes.rays + sizes.tilesX * sizes.tilesY * sizes.screenRays,
        );
    }

    /**
     * A onda dos raios (refeita quando os raios crescem) e os kernels de material por classe da revisão das funções
     * `material` da estrutura de raios; os kernels dos raios na primeira vez.
     */
    private syncTrace(c: Ctx, scene: RayScene): void {
        const rays = this.waveRays(this.buffers!.sizes);
        if (this.wave.capacity < rays || scene.materialRevision !== this.materialRevision) {
            const first = this.materialRevision < 0;
            this.materialRevision = scene.materialRevision;
            const w = this.wave.ensure(rays, scene.materialFunctions, scene.materialRevision);
            if (w.bindings !== undefined) c.bind(w.bindings);
            for (const id of w.released) c.release(id);
            for (const p of w.pipelines) c.prepare(p);
            if (first) for (const p of TRACES) c.prepare(p);
        }
        this.announceReady(c);
    }

    /** Emite `globalIlluminationReady` quando os kernels da revisão em uso (e os fixos) ficam prontos pela primeira vez. */
    private announceReady(c: Ctx): void {
        const revision = this.materialRevision;
        if (revision < 0 || revision === this.announcedRevision) return;
        const ids = [...TRACES, ...FIXED].map((d) => d.id);
        if (!ids.every((id) => c.bound.pipelines.get(id)?.ready === true)) return;
        if (!this.wave.ready(c.bound) || !this.wave.shadeReady(c.bound)) return;
        this.announcedRevision = revision;
        this.events.emit('globalIlluminationReady', { revision });
    }

    /** O uniform do quadro: cascatas na câmera, raios, ajuste, rebatimentos, rotação e tempo. */
    private writeParams(c: Ctx, gi: GlobalIllumination, sizes: Sizes, cameraSlot: number): void {
        const d = gi.data;
        // Os passes do filtro à-trous: o passo, a metade lida, a escrita e o último (escreve a textura do desenho).
        FILTER_STEPS.forEach((step, k) => {
            this.filterSteps.write(k, {
                step: [step, k % 2, (k + 1) % 2, k === FILTER_STEPS.length - 1 ? 1 : 0],
            });
        });
        this.filterSteps.flush(FILTER_STEPS.length);
        const canvas = this.core.canvasSize();
        const eye = d.center.length >= 3 ? d.center : this.cameraPosition(c);
        const cascades: number[][] = [];
        for (let k = 0; k < 4; k++) {
            const s = d.probeSpacing * 2 ** k;
            cascades.push([
                Math.floor((eye[0] ?? 0) / s) - GI_GRID[0] / 2,
                Math.floor((eye[1] ?? 0) / s) - GI_GRID[1] / 2,
                Math.floor((eye[2] ?? 0) / s) - GI_GRID[2] / 2,
                s,
            ]);
        }
        const coarsest = d.probeSpacing * 2 ** (d.cascades - 1);
        // As cáusticas ativas na cena (o `Caustics` ligado): as sondas não leem o especular direto de vidro e metal liso.
        const caustics =
            (c.bound.slots.caustics?.resource as Caustics | undefined)?.enabled === true;
        const rotation = frameRotation(this.frame);
        const time = (c.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        d.params = [
            {
                grid: [GI_GRID[0], GI_GRID[1], GI_GRID[2], d.cascades],
                cascade0: cascades[0]!,
                cascade1: cascades[1]!,
                cascade2: cascades[2]!,
                cascade3: cascades[3]!,
                rays: [
                    sizes.rays,
                    this.frame,
                    (this.frame * sizes.updated) % sizes.probes,
                    sizes.updated,
                ],
                tuning: [d.hysteresis, NORMAL_BIAS, VIEW_BIAS, coarsest * GI_GRID[0] * 1.5],
                bounces: [sizes.bounces, d.enabled && d.lightPath ? 1 : 0, 0, caustics ? 1 : 0],
                rotation0: rotation[0]!,
                rotation1: rotation[1]!,
                rotation2: rotation[2]!,
                extra: [1, 0, 0, time],
                counts: [this.resources.poolCount(Light.schema.name), 0, 0, 0],
                screen: [sizes.tilesX, sizes.tilesY, sizes.screenRays, cameraSlot],
                screen1: [Math.round(1 / d.screenFraction), 0, this.screenActive ? 1 : 0, 0],
                screenSize: [canvas?.width ?? 1, canvas?.height ?? 1, sizes.tile, d.hysteresis],
            },
        ];
    }

    /** Slot da câmera ativa no pool `CameraMatrices` (sem câmera, nenhum). */
    private cameraSlot(c: Ctx): number | undefined {
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        return id === undefined ? undefined : c.bound.slots.cameras?.slotOf(id);
    }

    /** Posição de mundo da câmera ativa (o `Transform` da entidade dela). */
    private cameraPosition(c: Ctx): readonly number[] {
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        const transform =
            id === undefined
                ? undefined
                : this.world.resourcesOf(id).find((r): r is Transform => r instanceof Transform);
        return transform?.data.position ?? [0, 0, 0, 1];
    }
}
