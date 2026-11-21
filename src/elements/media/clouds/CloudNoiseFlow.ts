import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, TextureViewSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { Time } from '../../../scene/time/Time';
import type { World } from '../../../scene/world/World';
import { Camera } from '../../scene/Camera';
import { Sky } from '../../scene/sky/Sky';
import { Transform } from '../../scene/Transform';
import { CloudLayer, cloudPhaseParams, cloudPhaseTruncation } from './CloudLayer';
import {
    CLOUD_DETAIL_SIZE,
    CLOUD_EROSION,
    CLOUD_OCTAVES,
    CLOUD_SHADOW_PIVOT,
    cloudCoverageLevels,
    CLOUD_SHADOW_TOLERANCE,
    CLOUD_SCATTER_EXTENT,
    CLOUD_SCATTER_NEAR,
    CLOUD_SCATTER_PRIOR,
    CLOUD_SCATTER_SNAP,
    CLOUD_SCATTER_SUN_MEMORY,
    CLOUD_SCATTER_VIEW_MEMORY,
    CLOUD_SCATTER_WINDOW,
    CLOUD_SHAPE_SIZE,
    CLOUD_EARTH_OMEGA,
    CLOUD_WEATHER_FREE_DRAG,
    CLOUD_WEATHER_SIZE,
    CLOUD_WEATHER_STENCIL,
} from './schemas';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import {
    cloudHistorySlots,
    cloudWeatherSlots,
    cloudNoiseKernel,
    cloudOutputs,
    cloudShapeAt,
    cloudShapeAtPoint,
} from './shaders';

/** Slots do estágio dos volumes e do uniforme das nuvens. */
export interface CloudNoiseSlots extends SlotMap {
    /** A camada de nuvens (uma por cena). */
    readonly cloud: SingletonSlot<false>;
    /** O céu (o planeta, o sol). */
    readonly sky: SingletonSlot<true>;
    /** A câmera ativa e as matrizes das câmeras. */
    readonly camera: SingletonSlot<true>;
    readonly cameras: PoolSlot<true>;
    /** O tempo simulado (o vento). */
    readonly time: SingletonSlot<true>;
    /** A série da marcha (a validade do histórico do quadro). */
    readonly cloudMarch: ChannelSlot<false>;
    /** A série do estado do tempo (a validade dele; R19). */
    readonly cloudWeather: ChannelSlot<false>;
}

type Ctx = TransitionContext<CloudNoiseSlots>;

/** Hash FNV-1a de 32 bits de um texto. */
function fnv1a(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return h >>> 0;
}

/** Tempo (s) da evolução da forma com uma função de cobertura (ela pode variar no tempo; o mapa é medido pelas provas). */
const CLOUD_SHADOW_COVERAGE_EVOLUTION = 600;

/** Normaliza (x, y, z); `fallback` se nulo. */
function unit(v: readonly number[], fallback: readonly number[]): number[] {
    const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
    return l > 1e-9 ? [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l] : [...fallback];
}

const cross = (a: readonly number[], b: readonly number[]): number[] => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot = (a: readonly number[], b: readonly number[]): number =>
    a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * CloudNoiseFlow — o uniforme das nuvens do quadro e os volumes de ruído (spec 041, R3, R6; fase `transform`, depois da
 * câmera e do céu). A cada quadro empacota os valores da `CloudLayer`, do `Sky` (o planeta, o sol) e da câmera no
 * uniforme: a casca, a fase pelo diâmetro, os deslocamentos do vento reduzidos módulo o período em f64, o quadrado de
 * cobertura e o referencial do mapa visto do sol encaixados no texel da câmera, a marcha (perfil, quadro de Bayer pelo
 * relógio, slot da câmera) e a validade do histórico (a série da marcha escrita no quadro anterior). Quando a função de
 * forma (o código ou os valores) muda, refaz os volumes de forma e de detalhe na GPU, inteiros num quadro. Sem
 * `CloudLayer`, nada; sem `Sky` ou sem câmera, nada.
 */
export class CloudNoiseFlow extends Flow<CloudNoiseSlots, 'idle'> {
    readonly type = 'CloudNoiseFlow';
    readonly slots: CloudNoiseSlots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private views: readonly (TextureViewSpec | undefined)[] = [];
    /** O pipeline dos volumes (pelo módulo composto com a função de forma) e a chave dos volumes já feitos. */
    private pipeline: string | undefined;
    private built = '';
    private wanted = '';
    private active = false;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.slots = {
            cloud: slot.singleton(CloudLayer.schema),
            sky: slot.singleton(Sky.schema, { optional: true }),
            camera: slot.singleton(Camera.schema, { optional: true }),
            cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
            time: slot.singleton(Time.schema, { optional: true }),
            cloudMarch: cloudHistorySlots.cloudMarch,
            cloudWeather: cloudWeatherSlots.cloudWeather,
        };
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotsResolved: 'ignore',
                entitiesChanged: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    /** Refaz os volumes quando a forma mudou. */
    dispatch(frame: Frame, bound: BoundFlow<CloudNoiseSlots>): void {
        if (!this.active || this.pipeline === undefined || this.built === this.wanted) return;
        const p = bound.pipelines.get(this.pipeline);
        if (p?.role !== 'compute' || !p.ready) return;
        frame.compute('CloudNoiseFlow.volumes', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(CLOUD_SHAPE_SIZE ** 3, WORKGROUP_SIZE.value);
        });
        const d = bound.pipelines.get(`${this.pipeline}:detail`);
        if (d?.role !== 'compute' || !d.ready) return;
        frame.compute('CloudNoiseFlow.detail', (pass) => {
            pass.bind.setPipeline(d.spec);
            d.bindTo(pass.bind);
            pass.dispatch.invocations(CLOUD_DETAIL_SIZE ** 3, WORKGROUP_SIZE.value);
        });
        this.built = this.wanted;
    }

    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource as CloudLayer;
        const sky = c.bound.slots.sky?.resource as Sky | undefined;
        const cameraSlot = this.cameraSlot(c);
        this.active = sky !== undefined && cameraSlot !== undefined;
        if (!this.active || sky === undefined || cameraSlot === undefined) return;
        for (const id of ['shape', 'detail']) this.resources.ensureAllocated(cloud, id);
        const views = (['shape', 'detail'] as const).map((id) =>
            c.bound.slots.cloud.textureViewOf(id),
        );
        if (views.some((v) => v === undefined)) {
            this.active = false;
            return;
        }
        if (views.some((v, k) => v !== this.views[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [cloudOutputs.shape, views[0]!],
                    [cloudOutputs.detail, views[1]!],
                ]),
            );
            this.views = views;
            this.built = '';
        }
        this.syncShape(c, cloud);
        this.writeParams(c, cloud, sky, cameraSlot);
    }

    /** O kernel composto com a função de forma (um por módulo dela) e a chave dos volumes (o módulo e os valores). */
    private syncShape(c: Ctx, cloud: CloudLayer): void {
        const fn = cloud.shapeFunction;
        const composite = fn.composite;
        if (composite === undefined) return;
        const id = `cloud_noise:${composite.module.name}`;
        if (id !== this.pipeline) {
            if (this.pipeline !== undefined) {
                c.release(this.pipeline);
                c.release(`${this.pipeline}:detail`);
            }
            const shader = bindPoints(
                cloudNoiseKernel,
                new Map([[cloudShapeAtPoint, cloudShapeAt(composite)]]),
            );
            const kernel = (pid: string, entry: string): PipelineDescriptor => ({
                id: pid,
                role: 'compute',
                shader,
                entryPoints: [entry],
            });
            c.prepare(kernel(id, 'cloud_noise_shape_main'));
            c.prepare(kernel(`${id}:detail`, 'cloud_noise_detail_main'));
            this.pipeline = id;
        }
        this.wanted = `${id}|${JSON.stringify(fn.data)}`;
    }

    /** O uniforme do quadro. */
    private writeParams(c: Ctx, cloud: CloudLayer, sky: Sky, cameraSlot: number): void {
        const d = cloud.data;
        const q = d.quality;
        const s = sky.data;
        const time = c.bound.slots.time?.resource as Time | undefined;
        const t = time?.simulated ?? 0;
        const eye = this.cameraPosition(c);
        const groundRadius = ((s.radii[0] ?? 6360) + (s.radii[3] ?? 0.2)) * 1000;
        // Com o tempo, a casca vai à tropopausa (a torre do cúmulo-nimbo) e o topo do tempo bom é uma fração dela.
        const shellTop = cloud.shellTop;
        const thickness = shellTop - d.base;
        const wind = cloud.windOffsets(t);
        const speed = Math.hypot(d.wind[0]!, d.wind[1]!);
        const windDir = speed > 1e-9 ? [d.wind[0]! / speed, d.wind[1]! / speed] : [1, 0];
        // O mapa de cobertura em níveis (R21 rodada 19, T077): a grade no referencial das nuvens (o vento × tempo) — os
        // texels andam com as nuvens, e a nuvem que o vento leva não muda de forma ao passar pela grade (com a grade presa
        // ao mundo, a interpolação da cobertura mudava a cada quadro — e o mapa visto do sol por páginas, preso às nuvens,
        // era refeito à toa). As janelas dos níveis ficam presas à página em volta da câmera nesse referencial (f64 aqui).
        const coverageEye = [(eye[0] ?? 0) - wind.coverage[0], (eye[2] ?? 0) - wind.coverage[1]];
        const coveragePages = this.coveragePagesParams(cloud);
        const sun = unit(s.sunDirection, [0, 1, 0]);
        // O plano do mapa visto do sol por páginas (R11 revisto): a base pela rotação mínima de +y ao sol (contínua com o
        // sol andando); o pivô anda com o vento (o conteúdo das páginas fica preso às nuvens) mais a célula da grade do pivô que
        // contém a câmera no referencial das nuvens (cruzada a linha, as páginas mudam de lugar no plano: a assinatura do
        // pivô as refaz); a câmera no plano.
        const k = 1 / Math.max(1 + sun[1]!, 1e-6);
        const right = [sun[1]! + sun[2]! * sun[2]! * k, -sun[0]!, -sun[0]! * sun[2]! * k];
        const up = cross(sun, right);
        const cell = [
            Math.round(((eye[0] ?? 0) - wind.coverage[0]) / CLOUD_SHADOW_PIVOT),
            Math.round(((eye[2] ?? 0) - wind.coverage[1]) / CLOUD_SHADOW_PIVOT),
        ];
        const pivot = [
            wind.coverage[0] + cell[0]! * CLOUD_SHADOW_PIVOT,
            0,
            wind.coverage[1] + cell[1]! * CLOUD_SHADOW_PIVOT,
        ];
        const rel = [
            (eye[0] ?? 0) - pivot[0]!,
            (eye[1] ?? 0) - pivot[1]!,
            (eye[2] ?? 0) - pivot[2]!,
        ];
        // O centro das janelas no plano: a câmera, levada em cima até o meio da faixa entre o chão e o topo da casca na
        // parte vertical de `up` — com o sol baixo, `up` é quase vertical e as colunas que cortam as nuvens ficam a
        // 1,5–4 km da câmera no plano: os níveis finos ficam nelas e no chão, não no ar acima da casca.
        const ey = eye[1] ?? 0;
        const band = (Math.max(ey, shellTop) + 1000 + Math.min(ey, 0) - 1000) / 2 - ey;
        const shadowMap = this.shadowMapParams(cloud, sky, groundRadius, speed);
        const valid = c.bound.slots.cloudMarch.age(1) === 1;
        // O centro da grade do cache de espalhamento no referencial das nuvens (T074; `scatterGridCenter` da referência): a
        // câmera menos o deslocamento do vento, encaixada, e de volta ao mundo — as sondas andam com as nuvens. O centro no
        // referencial vai junto: o shader o compara com o do cache (o transporte da grade de antes quando muda).
        const scatterLocal = [
            Math.floor(((eye[0] ?? 0) - wind.coverage[0]) / CLOUD_SCATTER_SNAP + 0.5)
                * CLOUD_SCATTER_SNAP,
            Math.floor(((eye[2] ?? 0) - wind.coverage[1]) / CLOUD_SCATTER_SNAP + 0.5)
                * CLOUD_SCATTER_SNAP,
        ];
        const scatterCenter = [
            scatterLocal[0]! + wind.coverage[0],
            scatterLocal[1]! + wind.coverage[1],
        ];
        const shapeSlot = this.functionSlot(cloud, cloud.shapeFunction);
        const coverageSlot =
            cloud.coverageFunction === undefined
                ? 0
                : this.functionSlot(cloud, cloud.coverageFunction);
        const weather = this.weatherParams(c, cloud, thickness);
        d.params = [
            {
                shell: [groundRadius, d.base, shellTop, thickness],
                layer: [d.coverage, d.type, d.density, d.albedo],
                phase: cloudPhaseParams(d.dropletDiameter),
                octaves: [q.octaves, CLOUD_OCTAVES.a, CLOUD_OCTAVES.b, CLOUD_OCTAVES.c],
                shape: [...wind.shape, d.shapeScale],
                detail: [...wind.detail, d.detailScale],
                wind: [windDir[0]!, windDir[1]!, d.wind[0]!, d.wind[1]!],
                coverageMap: [coverageEye[0]!, coverageEye[1]!, q.coverageExtent, t],
                coverageOffset: [wind.coverage[0], wind.coverage[1], q.coverage.texel, 0],
                coveragePages,
                sunFrame: [pivot[0]!, pivot[1]!, pivot[2]!, 0],
                sunRight: [right[0]!, right[1]!, right[2]!, dot(rel, right)],
                sunUp: [up[0]!, up[1]!, up[2]!, dot(rel, up) + band * up[1]!],
                sunDir: [sun[0]!, sun[1]!, sun[2]!, 0],
                sunMap: shadowMap.map,
                sunPages: [shadowMap.budget, shadowMap.signature, cell[0]! >>> 0, cell[1]! >>> 0],
                march: [q.steps, q.lightSteps, time?.frame ?? 0, cameraSlot],
                flags: [
                    valid ? 1 : 0,
                    shapeSlot,
                    coverageSlot,
                    cloud.coverageFunction === undefined && d.weather === undefined ? 0 : 1,
                ],
                timing: [time?.dt ?? 0, q.panoramaSteps, q.marchScale, 0],
                eye: [eye[0] ?? 0, eye[1] ?? 0, eye[2] ?? 0, 0],
                scatterGrid: [
                    scatterCenter[0]!,
                    scatterCenter[1]!,
                    CLOUD_SCATTER_NEAR,
                    Math.asinh(CLOUD_SCATTER_EXTENT / CLOUD_SCATTER_NEAR),
                ],
                scatterParams: [
                    CLOUD_SCATTER_PRIOR,
                    CLOUD_SCATTER_WINDOW,
                    // O cache é série por páginas: as páginas que valem são as carimbadas na época (o shader).
                    1,
                    CLOUD_SCATTER_SNAP,
                ],
                phaseCut: cloudPhaseTruncation(d.dropletDiameter),
                scatterWork: [
                    q.scatter.budget,
                    q.scatter.collisions,
                    time?.frame ?? 0,
                    this.scatterSignature(cloud, sky, shadowMap.signature),
                ],
                scatterSize: [...q.scatter.size, q.scatter.motion],
                scatterMemory: [
                    CLOUD_SCATTER_SUN_MEMORY,
                    CLOUD_SCATTER_VIEW_MEMORY,
                    scatterLocal[0]!,
                    scatterLocal[1]!,
                ],
                ...weather,
                anvil: [
                    (d.weather?.shear ?? 1) * d.wind[0]!,
                    (d.weather?.shear ?? 1) * d.wind[1]!,
                    ...wind.anvil,
                ],
            },
        ];
    }

    /**
     * A assinatura do que as sondas do cache de espalhamento e o panorama guardam além do sol, do vento, da câmera e do
     * tempo (T074; FNV-1a): o conteúdo do mapa visto do sol, a luz das gotículas (o albedo, o diâmetro), a qualidade e a
     * atmosfera sem a direção do sol. Outra assinatura, a página caminha e o panorama é refeito.
     */
    private scatterSignature(cloud: CloudLayer, sky: Sky, shadow: number): number {
        const d = cloud.data;
        const s = sky.data;
        return fnv1a(
            JSON.stringify([
                shadow,
                d.albedo,
                d.dropletDiameter,
                d.quality,
                s.sunIlluminance,
                s.rayleigh,
                s.mie,
                s.ozone,
                s.ground,
                s.night,
                s.haze,
            ]),
        );
    }

    /**
     * O mapa visto do sol por páginas (R11 revisto): o texel do nível 0, a tolerância, o tempo em que a evolução da forma
     * muda a transmitância de 1/e (a deriva do detalhe pelo vento — um texel do volume de detalhe a 0,1·|vento|, a
     * erosão de 35 % —, o tempo de formação com o tempo, 600 s com uma função de cobertura, que pode variar no tempo; 0
     * sem evolução) e o vento que sobra além do local (a bigorna levada pelo vento de cima); o orçamento de páginas por
     * quadro e a assinatura do conteúdo (FNV-1a dos valores que mudam as colunas: mudou, o mapa é refeito inteiro).
     */
    /**
     * As páginas do mapa de cobertura em níveis no uniforme (R21 rodada 19): o orçamento de páginas por quadro, a
     * assinatura do conteúdo (FNV-1a dos valores que mudam os texels: a página de outra assinatura é refeita no quadro),
     * se o conteúdo muda no tempo (a função de cobertura recebe o tempo; o tempo evolui — as páginas são refeitas pela
     * idade) e quantos níveis.
     */
    private coveragePagesParams(cloud: CloudLayer): number[] {
        const d = cloud.data;
        const q = d.quality;
        const signature = fnv1a(
            JSON.stringify([
                d.base,
                d.top,
                cloud.shellTop,
                d.coverage,
                d.type,
                d.weather ?? null,
                q.coverage.texel,
                q.coverageExtent,
                cloud.coverageFunction?.data ?? null,
                cloud.pressureFunction?.data ?? null,
            ]),
        );
        const varying = cloud.coverageFunction !== undefined || d.weather !== undefined;
        return [q.coverage.budget, signature, varying ? 1 : 0, cloudCoverageLevels(q)];
    }

    private shadowMapParams(
        cloud: CloudLayer,
        sky: Sky,
        groundRadius: number,
        speed: number,
    ): { map: number[]; budget: number; signature: number } {
        const d = cloud.data;
        const q = d.quality;
        const drift = 0.1 * speed;
        const detail = drift > 0 ? d.detailScale / CLOUD_DETAIL_SIZE / drift / CLOUD_EROSION : 0;
        const limits = [
            detail,
            d.weather?.formation ?? 0,
            cloud.coverageFunction === undefined ? 0 : CLOUD_SHADOW_COVERAGE_EVOLUTION,
        ].filter((v) => v > 0);
        const evolution = limits.length === 0 ? 0 : Math.min(...limits);
        const extra = d.weather === undefined ? 0 : Math.max(d.weather.shear - 1, 0) * speed;
        const signature = fnv1a(
            JSON.stringify([
                groundRadius,
                d.base,
                d.top,
                cloud.shellTop,
                d.coverage,
                d.type,
                d.density,
                d.wind,
                d.shapeScale,
                d.detailScale,
                d.weather ?? null,
                q.shadow.texel,
                this.wanted ?? '',
                cloud.coverageFunction?.data ?? null,
                cloud.pressureFunction?.data ?? null,
                sky.data.radii,
            ]),
        );
        return {
            map: [q.shadow.texel, CLOUD_SHADOW_TOLERANCE, evolution, extra],
            budget: q.shadow.budget,
            signature,
        };
    }

    /**
     * Os campos do tempo no uniforme (spec 041, R19): f = 2Ω sin φ, os atritos e o tempo de formação; o padrão de sistemas
     * (o lado das células, a amplitude das baixas na latitude — a dada a 45° × f_e(φ)/f_e(45°), a anomalia escala com a
     * rotação — e o teto das altas pelo equilíbrio regular, 0,8·ρ f_e² R²/24, e a vida); o quadrado do tempo (o topo do
     * tempo bom como fração da casca, os texels, o lado — o do quadrado de cobertura — e o estêncil); as marcas. Sem o
     * tempo, só o topo do tempo bom (1: a casca inteira) — a densidade fora do mapa o lê.
     */
    private weatherParams(
        c: Ctx,
        cloud: CloudLayer,
        thickness: number,
    ): Record<'weather' | 'weatherPattern' | 'weatherMap' | 'weatherFlags', number[]> {
        const w = cloud.data.weather;
        const q = cloud.data.quality;
        if (w === undefined)
            return {
                weather: [0, CLOUD_WEATHER_FREE_DRAG, 0, 1],
                weatherPattern: [1, 0, 0, 1],
                weatherMap: [1, CLOUD_WEATHER_SIZE, q.coverageExtent, 1],
                weatherFlags: [0, 0, 0, 0],
            };
        const f = 2 * CLOUD_EARTH_OMEGA * Math.sin((w.latitude * Math.PI) / 180);
        const r = CLOUD_WEATHER_FREE_DRAG;
        const fe = Math.hypot(f, r);
        const fe45 = Math.hypot(2 * CLOUD_EARTH_OMEGA * Math.SQRT1_2, r);
        const amplitude = (w.amplitude * fe) / fe45;
        const highCap = (0.8 * 1.2 * fe * fe * w.scale * w.scale) / 24;
        const valid = c.bound.slots.cloudWeather.age(1) === 1;
        const pressureSlot =
            cloud.pressureFunction === undefined
                ? 0
                : this.functionSlot(cloud, cloud.pressureFunction);
        return {
            weather: [f, r, w.friction, w.formation],
            weatherPattern: [w.scale, amplitude, highCap, w.lifetime],
            weatherMap: [
                Math.min(1, (cloud.data.top - cloud.data.base) / thickness),
                CLOUD_WEATHER_SIZE,
                q.coverageExtent,
                w.scale / CLOUD_WEATHER_STENCIL,
            ],
            weatherFlags: [1, pressureSlot, valid ? 1 : 0, w.seed],
        };
    }

    /** Slot do registro de parâmetros de uma função da camada no pool da forma dela. */
    private functionSlot(
        cloud: CloudLayer,
        fn:
            | CloudLayer['shapeFunction']
            | NonNullable<CloudLayer['coverageFunction']>
            | NonNullable<CloudLayer['pressureFunction']>,
    ): number {
        const id = this.world.entityIdOfResource(cloud);
        const schema = fn.getDescriptors()[0]?.schema;
        if (id === undefined || schema === undefined) return 0;
        return this.resources.poolSlotOf(schema.name, id) ?? 0;
    }

    /** Slot da câmera ativa no pool `CameraMatrices`. */
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
