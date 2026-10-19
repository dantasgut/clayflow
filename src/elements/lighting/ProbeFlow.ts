import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    TextureViewSpec,
} from '../../scene/contracts/gpu';
import type { EventBus } from '../../scene/events/EventBus';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../scene/flows/Flow';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { slot, type PoolSlot, type SingletonSlot, type SlotMap } from '../../scene/flows/slots';
import { bindPoints } from '../../scene/shaders/bindPoints';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { Time } from '../../scene/time/Time';
import type { World } from '../../scene/world/World';
import { closure } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import { RayScene, type RayMaterialFunction } from '../raytrace/RayScene';
import { Camera } from '../scene/Camera';
import { Light } from '../scene/Light';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import { Transform } from '../scene/Transform';
import { GlobalIllumination } from './GlobalIllumination';
import {
    GI_GRID,
    GI_IRRADIANCE_TEXELS,
    GI_MAX_PROBES,
    GI_SCREEN_TILE_MIN,
    GI_VISIBILITY_TEXELS,
    GI_PHOTON_SLOTS,
} from './schemas';
import {
    giHitMaterialPoint,
    giProbeAtlas,
    giProbeBlend,
    giProbeClassify,
    giProbeTrace,
    giRefraction,
    giRefractionFinish,
    giResources as R,
    giScreenPlace,
    giScreenResolve,
    giScreenTrace,
    giPhotonResolve,
    giPhotonTrace,
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
}

const slots: ProbeSlots = {
    gi: slot.singleton(GlobalIllumination.schema),
    rays: slot.singleton(RayScene.schema),
    camera: slot.singleton(Camera.schema, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
};

type Ctx = TransitionContext<ProbeSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const BLEND_IRRADIANCE = compute('gi_blend_irradiance', giProbeBlend, 'gi_blend_irradiance_main');
const BLEND_VISIBILITY = compute('gi_blend_visibility', giProbeBlend, 'gi_blend_visibility_main');
const CLASSIFY = compute('gi_classify', giProbeClassify, 'gi_probe_classify_main');
const ATLAS_IRRADIANCE = compute('gi_atlas_irradiance', giProbeAtlas, 'gi_atlas_irradiance_main');
const ATLAS_VISIBILITY = compute('gi_atlas_visibility', giProbeAtlas, 'gi_atlas_visibility_main');
const ATLAS_PROBES = compute('gi_atlas_probes', giProbeAtlas, 'gi_atlas_probes_main');
const SCREEN_PLACE = compute('gi_screen_place', giScreenPlace, 'gi_screen_place_main');
const SCREEN_RESOLVE = compute('gi_screen_resolve', giScreenResolve, 'gi_screen_resolve_main');
const SCREEN_FINISH = compute('gi_screen_finish', giScreenResolve, 'gi_screen_finish_main');
const SCREEN_FILTER = compute('gi_screen_filter', giScreenResolve, 'gi_screen_filter_main');
const PHOTON_RESOLVE = compute('gi_photon_resolve', giPhotonResolve, 'gi_photon_resolve_main');
const PROBE_RESPONSE = compute('gi_probe_response', giProbeBlend, 'gi_probe_response_main');
const REFRACTION_FINISH = compute(
    'gi_refraction_finish',
    giRefractionFinish,
    'gi_refraction_finish_main',
);
const REFRACTION_ARGS = compute(
    'gi_refraction_args',
    giRefractionFinish,
    'gi_refraction_args_main',
);
const REFRACTION_RESOLVE = compute(
    'gi_refraction_resolve',
    giRefractionFinish,
    'gi_refraction_resolve_main',
);
const FIXED = [
    BLEND_IRRADIANCE,
    BLEND_VISIBILITY,
    CLASSIFY,
    ATLAS_IRRADIANCE,
    ATLAS_VISIBILITY,
    ATLAS_PROBES,
    SCREEN_PLACE,
    SCREEN_RESOLVE,
    SCREEN_FINISH,
    SCREEN_FILTER,
    PHOTON_RESOLVE,
    PROBE_RESPONSE,
    REFRACTION_FINISH,
    REFRACTION_ARGS,
    REFRACTION_RESOLVE,
];
/** vec4f do começo do histórico da tela: a vista-projeção e a câmera anteriores (`GI_SCREEN_HISTORY_HEADER`). */
const SCREEN_HISTORY_HEADER = 5;
/** vec4f do começo do histórico da refração: a vista-projeção anterior (`GI_REFRACTION_HEADER`). */
const REFRACTION_HISTORY_HEADER = 4;
/** Ladrilhos de 8 × 8 pixels da marcação da refração traçada (`GI_REFRACTION_TILE`). */
const refractionTiles = (width: number, height: number): number =>
    Math.ceil(width / 8) * Math.ceil(height / 8);
/**
 * Caminhos na fila de continuação da refração traçada: ¼ dos pixels (os longos são poucos; cheia, o caminho termina no
 * passe por pixel), dentro de um despacho indireto de uma dimensão.
 */
const refractionQueue = (pixels: number): number =>
    Math.min(Math.ceil(pixels / 4), 65535 * WORKGROUP_SIZE.value);
/** vec4f por sonda de tela no histórico além das gerações (posição, normal, estado da resposta). */
const SCREEN_HISTORY_FIXED = 3;
/** Ids dos kernels compostos com as funções `material` (sondas do mundo e de tela, alvos e fótons) de uma revisão. */
const traceIds = (
    revision: number,
): readonly [string, string, string, string, string, string, string] => [
    `gi_trace:${revision}`,
    `gi_screen_trace:${revision}`,
    `gi_photon_trace:${revision}`,
    `gi_photon_targets:${revision}`,
    `gi_refraction:${revision}`,
    `gi_refraction_tiles:${revision}`,
    `gi_refraction_continue:${revision}`,
];
/** f32 da lista dos alvos dos fótons (`gi_photon_trace.wgsl`: cabeçalho, 64 caixas, áreas de 8 luzes × 64). */
const PHOTON_TARGET_WORDS = 8 + 8 * 64 + 8 * 64;

/** Vieses do ponto amostrado (frações do espaçamento): pela normal e pela vista (DDGI). */
const NORMAL_BIAS = 0.1;
const VIEW_BIAS = 0.3;
/**
 * Ligações de storage que o kernel mais carregado usa sem funções `material` (os raios das sondas de tela: os dois pools
 * da estrutura, as luzes, os rebatimentos das sondas do mundo, o trabalho e o histórico da tela) mais uma forma de
 * função; cada forma a mais é mais uma (o limite do dispositivo é conferido pela C2 na preparação).
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
    /** Pixels do alvo (a refração traçada e o histórico dela), no total e por eixo. */
    readonly pixels: number;
    readonly pixelsX: number;
    readonly pixelsY: number;
    /** Pixels por lado do ladrilho no alvo atual. */
    readonly tile: number;
}

/** Buffers privados das sondas. */
interface Buffers {
    readonly sizes: Sizes;
    readonly rays: StorageBufferSpec;
    readonly generations: StorageBufferSpec;
    readonly radiance: StorageBufferSpec;
    /** Por sonda atualizada no quadro: a histerese e o estado da resposta (`gi_probe_response_main`). */
    readonly probeH: StorageBufferSpec;
    readonly visibility: StorageBufferSpec;
    readonly screenWork: StorageBufferSpec;
    readonly screenHistory: StorageBufferSpec;
    readonly photonTargets: StorageBufferSpec;
    readonly refractionHistory: StorageBufferSpec;
    readonly refractionQueue: StorageBufferSpec;
    /** Argumentos do despacho indireto da continuação (x, y, z) e a contagem da fila (w). */
    readonly refractionCount: IndirectBufferSpec;
}

/** Composição das funções `material` nos acertos (um `switch` pelo índice da função da instância). */
export function composeHitMaterial(functions: readonly RayMaterialFunction[]): WgslModule {
    const cases = functions.map((f, k) => {
        const call = `${f.functionName}(s, m, ${f.loaderName}(fn_slot))`;
        return `        case ${k + 1}u: { c = ${f.returnsClosure ? call : `closure_from_params(${call})`}; }`;
    });
    return wgslModule({
        name: `gi_hit_material_${functions.map((f) => f.module.name).join('_')}`,
        requires: [materialPointTypes, closure, ...functions.map((f) => f.module)],
        structs: [StandardMaterialSchema],
        source: [
            '// Funções `material` da cena nos acertos dos raios (gerado; spec 033, R3).',
            'fn gi_hit_material(index: u32, s: SurfaceSample, m: StandardMaterial, fn_slot: u32) -> Closure {',
            '    var c: Closure;',
            '    switch (index) {',
            ...cases,
            '        default: { c = closure_from_params(SurfaceParams(m.albedo, m.roughness, m.metallic, vec3f(0.0))); }',
            '    }',
            '    return closure_sanitize(c);',
            '}',
        ].join('\n'),
    });
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
function random(seed: number): number {
    let s = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0;
    s = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0;
    return (((s >>> 22) ^ s) >>> 0) / 4294967296;
}

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
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly events: EventBus;
    private readonly resources: ResourceDirectory;
    private buffers: Buffers | undefined;
    private atlases: readonly (TextureViewSpec | undefined)[] = [];
    private prepared = false;
    /** Revisão dos kernels dos raios em uso e a que está compilando (composição nova das funções `material`). */
    private traceRevision: number | undefined;
    private nextTraceRevision: number | undefined;
    private materialRevision = -1;
    /** Revisão já anunciada pronta (`globalIlluminationReady`). */
    private announcedRevision = -1;
    private frame = 0;
    /** Fótons do quadro (0 sem cáusticas). */
    private photons = 0;
    private active = false;
    /** A luz indireta ligada (sem ela, só a refração traçada roda). */
    private indirect = true;
    /** Material que refrata na cena: a refração traçada roda. */
    private refraction = false;
    /** Coleta final na tela no quadro (ligada, com câmera e com o canvas). */
    private screenActive = false;
    private unsupported = false;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.events = ctx.events;
        this.resources = ctx.resources;
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
        const traces = this.readyTraces(bound);
        const fixed = FIXED.map((d) => bound.pipelines.get(d.id));
        if (traces === undefined || fixed.some((p) => p?.role !== 'compute' || !p.ready)) return;
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
        const indirect = this.indirect;
        frame.compute('ProbeFlow', (pass) => {
            if (!indirect) return;
            run(pass, -1, updated * rays, W);
            // A resposta de cada sonda antes do acúmulo (spec 034, R7).
            run(pass, 11, updated, W);
            run(pass, 0, updated * GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS, W);
            run(pass, 1, updated * GI_VISIBILITY_TEXELS * GI_VISIBILITY_TEXELS, W);
            run(pass, 2, updated, W);
            run(pass, 3, updated * (GI_IRRADIANCE_TEXELS + 2) ** 2, W);
            run(pass, 4, updated * (GI_VISIBILITY_TEXELS + 2) ** 2, W);
            run(pass, 5, updated, W);
            run(pass, 6, tiles, W);
            run(pass, -2, tiles * screenRays, W);
            run(pass, 7, tiles, W);
            run(pass, 9, tiles, W);
            run(pass, 8, tiles > 0 ? 1 : 0, 1);
        });
        // Cáusticas por fótons (US5): os fótons do quadro e o acúmulo no hash.
        frame.compute('ProbeFlow.photons', (pass) => {
            if (!indirect) return;
            run(pass, -4, this.photons > 0 ? W : 0, W);
            run(pass, -3, Math.max(this.photons, 1), W);
            run(pass, 10, this.photons > 0 ? GI_PHOTON_SLOTS : 0, W);
        });
        // Refração traçada (spec 034, US7): depois das sondas e das cáusticas, que a luz dos acertos lê.
        if (this.refraction) {
            const { sizes, refractionCount } = this.buffers;
            const resume = traces[6];
            frame.compute('ProbeFlow.refraction', (pass) => {
                // Os ladrilhos com vidro ou água (poucos raios cada, e os que refratavam no quadro anterior); depois o
                // traçado só perto deles, os primeiros trechos de cada caminho; os caminhos longos continuam num despacho
                // indireto (um fio por caminho); a média temporal e o fim do quadro.
                run(pass, -6, refractionTiles(sizes.pixelsX, sizes.pixelsY), W);
                run(pass, -5, sizes.pixels, W);
                run(pass, 13, 1, 1);
                if (resume?.role === 'compute') {
                    pass.bind.setPipeline(resume.spec);
                    resume.bindTo(pass.bind);
                    pass.dispatch.workgroupsIndirect(refractionCount, 0);
                }
                run(pass, 14, sizes.pixels, W);
                run(pass, 12, 1, 1);
            });
        }
        this.frame++;
    }

    /** Libera os buffers privados. */
    override dispose(): void {
        this.releaseBuffers();
    }

    /** Os kernels dos raios prontos: os novos assim que compilam (os anteriores são liberados), senão os atuais. */
    private readyTraces(
        bound: BoundFlow<ProbeSlots>,
    ): readonly ReturnType<BoundFlow['compute']>[] | undefined {
        type Compute = ReturnType<BoundFlow['compute']>;
        const ready = (revision: number | undefined): Compute[] | undefined => {
            if (revision === undefined) return undefined;
            const ps = traceIds(revision).map((id) => bound.pipelines.get(id));
            return ps.every((p) => p?.role === 'compute' && p.ready)
                ? (ps as Compute[])
                : undefined;
        };
        return ready(this.nextTraceRevision) ?? ready(this.traceRevision);
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
                'refraction',
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
            pixels: canvas === undefined ? 0 : canvas.width * canvas.height,
            pixelsX: canvas?.width ?? 0,
            pixelsY: canvas?.height ?? 0,
        };
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
            && d.indirect
            && d.screenGather
            && cameraSlot !== undefined
            && sizes.tilesX > 0;
        this.writeParams(c, gi, sizes, cameraSlot ?? 0);
        this.active = d.enabled;
        this.indirect = d.indirect;
        this.refraction = d.refraction;
    }

    /** Buffers privados nos tamanhos dados (o histórico das sondas recomeça). */
    private allocate(sizes: Sizes): void {
        this.releaseBuffers();
        const storage = (name: string, bytes: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `gi_probes:${name}`,
                byteSize: Math.max(16, bytes),
            });
        const texels = GI_IRRADIANCE_TEXELS * GI_IRRADIANCE_TEXELS;
        this.buffers = {
            sizes,
            rays: storage('rays', sizes.updated * sizes.rays * sizes.bounces * 16),
            generations: storage('generations', GI_MAX_PROBES * texels * sizes.bounces * 8),
            radiance: storage('radiance', GI_MAX_PROBES * texels * 8),
            probeH: storage('probeH', sizes.updated * 16),
            visibility: storage(
                'visibility',
                GI_MAX_PROBES * GI_VISIBILITY_TEXELS * GI_VISIBILITY_TEXELS * 4,
            ),
            // Coleta final na tela: por sonda de tela, posição e normal e a irradiância do quadro de cada geração; o
            // histórico com a câmera anterior e as duas metades (quadro anterior e atual) de 3 + gerações vec4f.
            screenWork: storage(
                'screenWork',
                sizes.tilesX * sizes.tilesY * (2 + sizes.bounces) * 16,
            ),
            screenHistory: storage(
                'screenHistory',
                (SCREEN_HISTORY_HEADER
                    + sizes.tilesX * sizes.tilesY * (SCREEN_HISTORY_FIXED + sizes.bounces) * 2)
                    * 16,
            ),
            photonTargets: storage('photonTargets', PHOTON_TARGET_WORDS * 4),
            // Refração traçada (`gi_refraction_common.wgsl`): a vista-projeção anterior, as duas metades (radiância em
            // meia precisão, distância e quadros acumulados por pixel), a marca de cada ladrilho, a amostra do quadro
            // (2 por pixel) e os caminhos na fila; a fila (4 vec4f por caminho) e os argumentos da continuação.
            refractionHistory: storage(
                'refractionHistory',
                (REFRACTION_HISTORY_HEADER
                    + sizes.pixels * 4
                    + refractionTiles(sizes.pixelsX, sizes.pixelsY)
                    + 1)
                    * 16,
            ),
            refractionQueue: storage('refractionQueue', refractionQueue(sizes.pixels) * 64),
            refractionCount: this.core.create<IndirectBufferSpec>({
                kind: 'buffer',
                subkind: 'indirect',
                discriminator: 'gi_probes:refractionCount',
                byteSize: 16,
            }),
        };
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
                [R.probeH, b.probeH],
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
                [R.screenHistory, b.screenHistory],
                [R.photonTargets, b.photonTargets],
                [R.refractionOut, views[6]!],
                [R.refractionHistory, b.refractionHistory],
                [R.refractionQueue, b.refractionQueue],
                [R.refractionCount, { kind: 'buffer', buffer: b.refractionCount }],
            ]),
        );
    }

    /** Os kernels dos raios com a composição das funções `material` da cena (novos quando o conjunto muda). */
    private syncTrace(c: Ctx, scene: RayScene): void {
        if (this.nextTraceRevision !== undefined) {
            const next = traceIds(this.nextTraceRevision).map((id) => c.bound.pipelines.get(id));
            if (next.every((p) => p?.ready === true)) {
                if (this.traceRevision !== undefined)
                    for (const id of traceIds(this.traceRevision)) c.release(id);
                this.traceRevision = this.nextTraceRevision;
                this.nextTraceRevision = undefined;
            }
        }
        this.announceReady(c);
        if (scene.materialRevision === this.materialRevision) return;
        this.materialRevision = scene.materialRevision;
        const fns = scene.materialFunctions;
        const compose = (shader: WgslModule): WgslModule =>
            fns.length === 0
                ? shader
                : bindPoints(shader, new Map([[giHitMaterialPoint, composeHitMaterial(fns)]]));
        const [probeId, screenId, photonId, targetsId, refractionId, tilesId, continueId] =
            traceIds(this.materialRevision);
        if (this.nextTraceRevision !== undefined)
            for (const id of traceIds(this.nextTraceRevision)) c.release(id);
        c.prepare(compute(probeId, compose(giProbeTrace), 'gi_probe_trace_main'));
        c.prepare(compute(screenId, compose(giScreenTrace), 'gi_screen_trace_main'));
        c.prepare(compute(photonId, compose(giPhotonTrace), 'gi_photon_trace_main'));
        c.prepare(compute(targetsId, compose(giPhotonTrace), 'gi_photon_targets_main'));
        c.prepare(compute(refractionId, compose(giRefraction), 'gi_refraction_main'));
        c.prepare(compute(tilesId, compose(giRefraction), 'gi_refraction_tiles_main'));
        c.prepare(compute(continueId, compose(giRefraction), 'gi_refraction_continue_main'));
        if (this.traceRevision === undefined) this.traceRevision = this.materialRevision;
        else this.nextTraceRevision = this.materialRevision;
    }

    /** Emite `globalIlluminationReady` quando os kernels da revisão em uso (e os fixos) ficam prontos pela primeira vez. */
    private announceReady(c: Ctx): void {
        const revision = this.traceRevision;
        if (revision === undefined || revision === this.announcedRevision) return;
        const ids = [...traceIds(revision), ...FIXED.map((d) => d.id)];
        if (!ids.every((id) => c.bound.pipelines.get(id)?.ready === true)) return;
        this.announcedRevision = revision;
        this.events.emit('globalIlluminationReady', { revision });
    }

    /** O uniform do quadro: cascatas na câmera, raios, ajuste, rebatimentos, rotação e tempo. */
    private writeParams(c: Ctx, gi: GlobalIllumination, sizes: Sizes, cameraSlot: number): void {
        const d = gi.data;
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
        this.photons = d.caustics && d.indirect ? d.photons : 0;
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
                // (rebatimentos, ligada, refração traçada pronta, cáusticas).
                bounces: [
                    sizes.bounces,
                    d.enabled && d.indirect ? 1 : 0,
                    d.refraction && this.traceRevision !== undefined && sizes.pixels > 0 ? 1 : 0,
                    this.photons > 0 ? 1 : 0,
                ],
                rotation0: rotation[0]!,
                rotation1: rotation[1]!,
                rotation2: rotation[2]!,
                // Cáusticas: a célula do hash (1/16 do espaçamento das sondas), os fótons do quadro e o tempo.
                extra: [1, d.probeSpacing / 16, this.photons, time],
                counts: [this.resources.poolCount(Light.schema.name), GI_PHOTON_SLOTS, 0, 0],
                screen: [sizes.tilesX, sizes.tilesY, sizes.screenRays, cameraSlot],
                screen1: [
                    Math.round(1 / d.screenFraction),
                    this.frame & 1,
                    this.screenActive ? 1 : 0,
                    0,
                ],
                screenSize: [
                    canvas?.width ?? 1,
                    canvas?.height ?? 1,
                    sizes.tile,
                    d.screenHistory / (d.screenHistory + 1),
                ],
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

    private releaseBuffers(): void {
        const b = this.buffers;
        if (b === undefined) return;
        for (const buf of [
            b.rays,
            b.generations,
            b.radiance,
            b.probeH,
            b.visibility,
            b.screenWork,
            b.screenHistory,
            b.photonTargets,
            b.refractionHistory,
            b.refractionQueue,
            b.refractionCount,
        ])
            this.core.destroy(buf);
        this.buffers = undefined;
    }
}
