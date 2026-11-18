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
    CLOUD_OCTAVES,
    CLOUD_SCATTER_EXTENT,
    CLOUD_SCATTER_NEAR,
    CLOUD_SCATTER_PRIOR,
    CLOUD_SCATTER_SNAP,
    CLOUD_SCATTER_WINDOW,
    CLOUD_SHAPE_SIZE,
} from './schemas';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import {
    cloudHistorySlots,
    cloudScatterSlots,
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
    /** A série do cache de espalhamento (a validade dele). */
    readonly cloudScatter: ChannelSlot<false>;
}

type Ctx = TransitionContext<CloudNoiseSlots>;

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
    readonly slots: CloudNoiseSlots = {
        cloud: slot.singleton(CloudLayer.schema),
        sky: slot.singleton(Sky.schema, { optional: true }),
        camera: slot.singleton(Camera.schema, { optional: true }),
        cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
        time: slot.singleton(Time.schema, { optional: true }),
        cloudMarch: cloudHistorySlots.cloudMarch,
        cloudScatter: cloudScatterSlots.cloudScatter,
    };
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
        const thickness = d.top - d.base;
        const wind = cloud.windOffsets(t);
        const speed = Math.hypot(d.wind[0]!, d.wind[1]!);
        const windDir = speed > 1e-9 ? [d.wind[0]! / speed, d.wind[1]! / speed] : [1, 0];
        // O quadrado de cobertura e o mapa visto do sol encaixados no texel (a câmera andando não faz tremer).
        const covTexel = q.coverageExtent / q.coverageSize;
        const covCenter = [
            Math.round((eye[0] ?? 0) / covTexel) * covTexel,
            Math.round((eye[2] ?? 0) / covTexel) * covTexel,
        ];
        const sun = unit(s.sunDirection, [0, 1, 0]);
        const right = unit(Math.abs(sun[1]!) < 0.99 ? cross([0, 1, 0], sun) : [1, 0, 0], [1, 0, 0]);
        const up = cross(sun, right);
        // O plano do sol deformado por asinh em volta da câmera (texels finos perto, crescendo com a distância, até as
        // nuvens do horizonte). Na direita (horizontal), a escala `near`; em cima, a mesma escala na parte horizontal de
        // `up` mais a meia faixa da casca (do chão − 1 km ao topo + 1 km) na parte vertical — com o sol baixo, `up` é
        // quase vertical e a casca é uma faixa estreita do plano, com texels finos na altitude.
        const half = q.shadow.extent / 2;
        const ey = eye[1] ?? 0;
        const lo = Math.min(ey, 0) - 1000;
        const hi = Math.max(ey, d.top) + 1000;
        const band = (hi - lo) / 2;
        const upH = Math.hypot(up[0]!, up[2]!);
        const upY = Math.abs(up[1]!);
        const x0u = q.shadow.near;
        const ku = Math.asinh(half / x0u);
        const x0v = q.shadow.near * upH + band * upY;
        const kv = Math.asinh((half * upH + band * upY) / x0v);
        const vMid = ((hi + lo) / 2 - ey) * up[1]!;
        // O centro encaixado no texel de perto (a câmera andando não faz tremer).
        const tu = (2 * x0u * ku) / q.shadow.size;
        const tv = (2 * x0v * kv) / q.shadow.size;
        const sx = Math.round(dot(eye, right) / tu) * tu;
        const sy = Math.round((dot(eye, up) + vMid) / tv) * tv;
        const center = [
            right[0]! * sx + up[0]! * sy,
            right[1]! * sx + up[1]! * sy,
            right[2]! * sx + up[2]! * sy,
        ];
        // A origem dos raios acima do topo em todo texel: o texel mais baixo fica `|up_y|·alcance` abaixo do centro.
        const far = Math.min(
            (d.top + 1000 - Math.min(center[1]!, 0) + upY * (half * upH + band * upY))
                / Math.max(sun[1]!, 0.02),
            2e6,
        );
        const valid = c.bound.slots.cloudMarch.age(1) === 1;
        const scatterValid = c.bound.slots.cloudScatter.age(1) === 1;
        // O centro da grade do cache de espalhamento encaixado (o shader refaz o encaixe da posição anterior da câmera).
        const scatterCenter = [
            Math.floor((eye[0] ?? 0) / CLOUD_SCATTER_SNAP + 0.5) * CLOUD_SCATTER_SNAP,
            Math.floor((eye[2] ?? 0) / CLOUD_SCATTER_SNAP + 0.5) * CLOUD_SCATTER_SNAP,
        ];
        const shapeSlot = this.functionSlot(cloud, cloud.shapeFunction);
        const coverageSlot =
            cloud.coverageFunction === undefined
                ? 0
                : this.functionSlot(cloud, cloud.coverageFunction);
        d.params = [
            {
                shell: [groundRadius, d.base, d.top, thickness],
                layer: [d.coverage, d.type, d.density, d.albedo],
                phase: cloudPhaseParams(d.dropletDiameter),
                octaves: [q.octaves, CLOUD_OCTAVES.a, CLOUD_OCTAVES.b, CLOUD_OCTAVES.c],
                shape: [...wind.shape, d.shapeScale],
                detail: [...wind.detail, d.detailScale],
                wind: [windDir[0]!, windDir[1]!, d.wind[0]!, d.wind[1]!],
                coverageMap: [covCenter[0]!, covCenter[1]!, q.coverageExtent, t],
                coverageOffset: [wind.coverage[0], wind.coverage[1], 0, 0],
                sunFrame: [center[0]!, center[1]!, center[2]!, q.shadow.extent],
                sunRight: [right[0]!, right[1]!, right[2]!, far],
                sunUp: [up[0]!, up[1]!, up[2]!, 0],
                sunDir: [sun[0]!, sun[1]!, sun[2]!, 0],
                sunWarp: [x0u, ku, x0v, kv],
                march: [q.steps, q.lightSteps, time?.frame ?? 0, cameraSlot],
                flags: [
                    valid ? 1 : 0,
                    shapeSlot,
                    coverageSlot,
                    cloud.coverageFunction === undefined ? 0 : 1,
                ],
                timing: [time?.dt ?? 0, q.panoramaSteps, 0, 0],
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
                    scatterValid ? 1 : 0,
                    CLOUD_SCATTER_SNAP,
                ],
                phaseCut: cloudPhaseTruncation(d.dropletDiameter),
                scatterWork: [q.scatter.stride, q.scatter.collisions, time?.frame ?? 0, 0],
            },
        ];
    }

    /** Slot do registro de parâmetros de uma função da camada no pool da forma dela. */
    private functionSlot(
        cloud: CloudLayer,
        fn: CloudLayer['shapeFunction'] | NonNullable<CloudLayer['coverageFunction']>,
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
