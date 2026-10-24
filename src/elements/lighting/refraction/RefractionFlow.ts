import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, IndirectBufferSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type PoolSlot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import { Time } from '../../../scene/time/Time';
import type { World } from '../../../scene/world/World';
import { CountToArgs } from '../../gpu/compute/CountToArgs';
import { composeHitMaterial } from '../../raytrace/hitMaterial';
import { RayScene } from '../../raytrace/RayScene';
import { rayHitMaterialPoint } from '../../raytrace/shaders';
import { Camera } from '../../scene/Camera';
import { Light } from '../../scene/Light';
import { Transform } from '../../scene/Transform';
import { Refraction } from './Refraction';
import {
    refractionCamera,
    refractionGradient,
    refractionQueue,
    refractionResources,
    refractionTrace,
} from './shaders';

/** Slots do estágio da refração. */
export interface RefractionSlots extends SlotMap {
    /** A refração da cena (parâmetros e alvos). */
    readonly refraction: SingletonSlot<false>;
    /** A estrutura de raios (sem ela, o estágio não traça). */
    readonly rays: SingletonSlot<true>;
    /** A câmera ativa e o pool das matrizes (o slot dela). */
    readonly camera: SingletonSlot<true>;
    readonly cameras: PoolSlot<true>;
    /** Relógio da cena (as funções `material` nos acertos). */
    readonly time: SingletonSlot<true>;
}

const slots: RefractionSlots = {
    refraction: slot.singleton(Refraction.schema),
    rays: slot.singleton(RayScene.schema, { optional: true }),
    camera: slot.singleton(Camera.schema, { optional: true }),
    cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    time: slot.singleton(Time.schema, { optional: true }),
};

type Ctx = TransitionContext<RefractionSlots>;

const compute = (id: string, shader: WgslModule, entry: string): PipelineDescriptor => ({
    id,
    role: 'compute',
    shader,
    entryPoints: [entry],
});

const QUEUE = compute('refraction_queue', refractionQueue, 'refraction_queue_main');
const QUEUE_COUNT = compute(
    'refraction_queue_count',
    refractionQueue,
    'refraction_queue_count_main',
);

/** Os kernels que leem materiais nos acertos, por revisão do conjunto de funções `material` da cena. */
function traceIds(revision: number): readonly [string, string] {
    return [`refraction_camera:${revision}`, `refraction_trace:${revision}`];
}

/** O kernel `shader` com as funções `material` da cena nos acertos (a composição da estrutura de raios). */
function composed(scene: RayScene, shader: WgslModule): WgslModule {
    const fns = scene.materialFunctions;
    return fns.length === 0
        ? shader
        : bindPoints(shader, new Map([[rayHitMaterialPoint, composeHitMaterial(fns)]]));
}

/** O kernel do gradiente temporal (também lê materiais nos acertos), por revisão. */
const gradientId = (revision: number): string => `refraction_gradient:${revision}`;

/** Os raios guardados para o gradiente do quadro seguinte e onde o próximo gradiente os lê. */
const GRADIENT_RAYS = [
    ['gradientOriginNext', 'gradientOrigin'],
    ['gradientDirectionNext', 'gradientDirection'],
] as const;

/**
 * Estágio da refração traçada (Camada 3, spec 034, R1): depois do pedido por pixel (o desenho dos transmissivos no
 * forward), compacta os pixels com pedido numa fila (a contagem também no estado do quadro), acha os meios em que a
 * câmera está e traça cada pixel da fila por despacho indireto — a contagem nunca volta à CPU. Os kernels que sombreiam
 * acertos compõem as funções `material` da cena (como a iluminação global) e são refeitos quando o conjunto muda (os
 * anteriores valem até os novos compilarem). Fase `forward`, depois dos opacos, dos sprites e da superfície da água,
 * antes da composição dos transmissivos e da água. Sem o pedido alocado (nenhum transmissivo desenhado com a refração),
 * sem a estrutura de raios ou desligada, não traça. Declara a cada quadro se produziu a `radiance` (a composição só
 * desenha quando sim). Com o gradiente temporal alocado (por quem filtra o traçado ou recomeça históricos), antes do
 * traçado, mede-o: em cada bloco de pixels, a amostra do quadro anterior refeita na cena de agora.
 */
export class RefractionFlow extends Flow<RefractionSlots, 'idle'> {
    readonly type = 'RefractionFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly countToArgs: CountToArgs;
    /** Fontes ligadas (outras = religa). */
    private bound: readonly unknown[] = [];
    /** A contagem da fila, quando ligada. */
    private queueCount: IndirectBufferSpec | undefined;
    /** Pixels do pedido (o despacho da fila). */
    private pixels = 0;
    /** Há o que traçar neste quadro (estrutura de raios, câmera, ligada). */
    private tracing = false;
    /** Revisão das funções `material` dos kernels em uso e da que compila. */
    private materialRevision = -1;
    private traceRevision: number | undefined;
    private nextTraceRevision: number | undefined;
    private frame = 0;
    /** Invocações do gradiente temporal (o despacho dele: os blocos em ladrilhos de 8 × 8). */
    private strata = 0;
    /** O kernel do gradiente temporal em uso (alocado por um consumidor) e a revisão dos materiais dele. */
    private gradient: string | undefined;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.world = ctx.world;
        this.countToArgs = new CountToArgs(ctx.core, { discriminator: 'refraction_queue' });
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                        // A composição lê as radiâncias só no quadro em que o traçado as escreve.
                        c.produced(
                            c.bound.slots.refraction.resource,
                            'radiance',
                            this.tracing
                                && this.pixels > 0
                                && this.queueReady(c.bound)
                                && this.readyTraces(c.bound) !== undefined,
                        );
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

    /**
     * Zera a contagem, compacta a fila, copia a contagem para o estado do quadro, deriva os argumentos do traçado, acha
     * os meios da câmera e traça.
     */
    dispatch(frame: Frame, bound: BoundFlow<RefractionSlots>): void {
        const count = this.queueCount;
        const queue = bound.pipelines.get(QUEUE.id);
        const queueCount = bound.pipelines.get(QUEUE_COUNT.id);
        if (
            count === undefined
            || this.pixels === 0
            || !this.queueReady(bound)
            || queue?.role !== 'compute'
            || queueCount?.role !== 'compute'
        )
            return;
        frame.clear(count, 0, 4);
        frame.compute('RefractionFlow.queue', (pass) => {
            pass.bind.setPipeline(queue.spec);
            queue.bindTo(pass.bind);
            pass.dispatch.invocations(this.pixels, WORKGROUP_SIZE.value);
            pass.bind.setPipeline(queueCount.spec);
            queueCount.bindTo(pass.bind);
            pass.dispatch.workgroups(1);
        });
        this.countToArgs.record(frame, {
            counts: count,
            index: 0,
            workgroupSize: WORKGROUP_SIZE.value,
        });
        const kernels = this.tracing ? this.readyTraces(bound) : undefined;
        if (kernels === undefined) return;
        const [camera, trace] = kernels as [
            ReturnType<BoundFlow['compute']>,
            ReturnType<BoundFlow['compute']>,
        ];
        const gradient =
            this.gradient === undefined ? undefined : bound.pipelines.get(this.gradient);
        const measures = gradient?.role === 'compute' && gradient.ready;
        frame.compute('RefractionFlow.trace', (pass) => {
            pass.bind.setPipeline(camera.spec);
            camera.bindTo(pass.bind);
            pass.dispatch.workgroups(1);
            // O gradiente lê a amostra do quadro anterior (as radiâncias ainda dele) e os meios da câmera de agora.
            if (measures) {
                pass.bind.setPipeline(gradient.spec);
                gradient.bindTo(pass.bind);
                pass.dispatch.invocations(this.strata, WORKGROUP_SIZE.value);
            }
            pass.bind.setPipeline(trace.spec);
            trace.bindTo(pass.bind);
            pass.dispatch.workgroupsIndirect(
                count,
                CountToArgs.dispatchOffset({ counts: count, index: 0 }),
            );
        });
        if (measures) {
            const refraction = bound.slots.refraction.resource;
            for (const [from, to] of GRADIENT_RAYS) {
                const src = this.resources.textureOf(refraction, from)!;
                frame.copyTextureToTexture(src, this.resources.textureOf(refraction, to)!, [
                    src.width,
                    src.height,
                    1,
                ]);
            }
        }
        this.frame++;
    }

    /** Libera os kernels da contagem. */
    override dispose(): void {
        this.countToArgs.destroy();
    }

    /** Os kernels da fila prontos. */
    private queueReady(bound: BoundFlow<RefractionSlots>): boolean {
        return [QUEUE.id, QUEUE_COUNT.id].every((id) => bound.pipelines.get(id)?.ready === true);
    }

    /** Os kernels dos acertos prontos: os novos assim que compilam, senão os atuais. */
    private readyTraces(
        bound: BoundFlow<RefractionSlots>,
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

    /**
     * Com o pedido alocado (por quem desenha os transmissivos), aloca a fila, a contagem, o estado do quadro e as
     * radiâncias, liga-os (religa quando mudam: redimensionamento), prepara os kernels e escreve o uniform do quadro.
     */
    private prepare(c: Ctx): void {
        const refraction = c.bound.slots.refraction.resource as Refraction;
        if (this.resources.textureOf(refraction, 'request') === undefined) {
            this.pixels = 0;
            return;
        }
        const R = refractionResources;
        // O gradiente temporal só quando um consumidor o alocou: então os raios dele também.
        const measures = this.resources.textureOf(refraction, 'gradient') !== undefined;
        // As texturas e onde cada uma é ligada: o gradiente lê a amostra do quadro anterior (a radiância como textura)
        // e grava os raios do quadro seguinte.
        const textures = [
            ['request', [R.request]],
            ['queue', [R.queueOut, R.queueIn]],
            ['frame', [R.frameOut, R.frame]],
            ['radiance', [R.radianceOut, R.radiance]],
            ['hit', [R.hitOut]],
            ...(measures
                ? ([
                      ['gradient', [R.gradientOut]],
                      ['gradientOrigin', [R.gradientOrigin]],
                      ['gradientDirection', [R.gradientDirection]],
                      ['gradientOriginNext', [R.gradientOriginOut]],
                      ['gradientDirectionNext', [R.gradientDirectionOut]],
                  ] as const)
                : []),
        ] as const;
        for (const [id] of textures.slice(1)) this.resources.ensureAllocated(refraction, id);
        // As inversas de mundo (spec 037): o histórico leva o ponto atingido ao espaço do objeto por elas.
        this.resources.ensurePoolAllocated(Transform.worldInverseSchema.name);
        const count = this.resources.ensureAllocated(refraction, 'queueCount');
        const views = textures.map(([id]) => this.resources.textureViewOf(refraction, id));
        if (count?.subkind !== 'indirect' || views.some((v) => v === undefined)) {
            this.pixels = 0;
            return;
        }
        const sources = [...views, count];
        if (sources.some((s, k) => s !== this.bound[k])) {
            const binds = new Map<WgslResource, BindingSource>([[R.queueCount, count]]);
            textures.forEach(([, resources], k) => {
                for (const r of resources) binds.set(r, views[k]!);
            });
            c.bind(binds);
            if (this.bound.length === 0) {
                c.prepare(QUEUE);
                c.prepare(QUEUE_COUNT);
            }
            this.countToArgs.prepare(count);
            this.bound = sources;
        }
        this.queueCount = count;
        const texture = this.resources.textureOf(refraction, 'request')!;
        this.pixels = texture.width * texture.height;
        const strata = this.resources.textureOf(refraction, 'gradient');
        // Em ladrilhos de 8 × 8 blocos (um grupo de 64 por ladrilho).
        this.strata =
            strata === undefined
                ? 0
                : Math.ceil(strata.width / 8) * Math.ceil(strata.height / 8) * 64;
        const rays = c.bound.slots.rays?.resource as RayScene | undefined;
        const cameraSlot = this.cameraSlot(c);
        this.tracing = refraction.enabled && rays !== undefined && cameraSlot !== undefined;
        if (rays !== undefined) {
            // As luzes nos acertos: o pool existe mesmo sem nenhuma luz na cena (só emissores ou só o céu).
            this.resources.ensurePool(Light.schema);
            this.syncTrace(c, rays);
            this.syncGradient(c, rays, measures);
        }
        this.writeParams(c, refraction, cameraSlot ?? 0);
    }

    /** Os kernels que sombreiam acertos com a composição das funções `material` da cena (novos quando ela muda). */
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
        if (scene.materialRevision === this.materialRevision) return;
        this.materialRevision = scene.materialRevision;
        const [cameraId, traceId] = traceIds(this.materialRevision);
        if (this.nextTraceRevision !== undefined)
            for (const id of traceIds(this.nextTraceRevision)) c.release(id);
        c.prepare(compute(cameraId, composed(scene, refractionCamera), 'refraction_camera_main'));
        c.prepare(compute(traceId, composed(scene, refractionTrace), 'refraction_trace_main'));
        if (this.traceRevision === undefined) this.traceRevision = this.materialRevision;
        else this.nextTraceRevision = this.materialRevision;
    }

    /**
     * O kernel do gradiente temporal: preparado quando um consumidor aloca o gradiente, refeito quando o conjunto de
     * funções `material` muda, liberado quando ninguém mais o lê (o novo vale quando compila; até lá, não mede).
     */
    private syncGradient(c: Ctx, scene: RayScene, measures: boolean): void {
        const id = measures ? gradientId(scene.materialRevision) : undefined;
        if (id === this.gradient) return;
        if (this.gradient !== undefined) c.release(this.gradient);
        this.gradient = id;
        if (id === undefined) return;
        c.prepare(compute(id, composed(scene, refractionGradient), 'refraction_gradient_main'));
    }

    /** O uniform do quadro: a câmera, as luzes, o quadro e o tempo (só quando mudam). */
    private writeParams(c: Ctx, refraction: Refraction, cameraSlot: number): void {
        const d = refraction.data;
        const time = (c.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        const lights = this.resources.poolCount(Light.schema.name);
        if (d.camera_slot !== cameraSlot) d.camera_slot = cameraSlot;
        if (d.light_count !== lights) d.light_count = lights;
        if (d.frame !== this.frame) d.frame = this.frame;
        if (d.time !== time) d.time = time;
    }

    /** Slot da câmera ativa no pool das matrizes. */
    private cameraSlot(c: Ctx): number | undefined {
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        return id === undefined ? undefined : c.bound.slots.cameras?.slotOf(id);
    }
}
