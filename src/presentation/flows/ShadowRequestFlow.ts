import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { Frame } from '../../scene/contracts/gpu';
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
import { Camera } from '../../elements/scene/Camera';
import { ShadowMap } from '../../elements/scene/ShadowMap';
import { castingShadowMap } from '../../elements/scene/shadowCaster';
import { FrameTargets } from '../app/FrameTargets';
import { ShadowRequestParamsSchema } from './renderSchemas';
import { shadowRequest, shadowRequestResources } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots dos pedidos de páginas. */
export interface ShadowRequestSlots extends SlotMap {
    /** O `ShadowMap` da luz que projeta. */
    readonly caster: SingletonSlot<false>;
    /** Pool `ShadowMatrix` (o referencial do quadro). */
    readonly matrices: PoolSlot<false>;
    /** A série dos pedidos (a fatia de agora, escrita). */
    readonly requests: ChannelSlot<false>;
    /** A profundidade da cena deste quadro. */
    readonly sceneDepth: TextureSlot<true>;
    /** A câmera ativa (sem ela, nenhum pedido). */
    readonly camera: SingletonSlot<true>;
    /** Pool das matrizes das câmeras. */
    readonly cameras: PoolSlot<true>;
    /** Os parâmetros (spec 039). */
    readonly work: WorkSlot<ShadowRequestWork>;
}

const PARAMS = 'shadow_request_params';

/** Resource de trabalho dos pedidos: os parâmetros. */
class ShadowRequestWork extends FlowWork {
    static readonly schema = new StructSchema('ShadowRequestWork', {});
    constructor() {
        super();
        this.use({
            descriptors: () => [
                { id: PARAMS, role: 'uniform', schema: ShadowRequestParamsSchema, upload: 'never' },
            ],
        });
    }
}

type Ctx = TransitionContext<ShadowRequestSlots>;

/**
 * ShadowRequestFlow — os pedidos de páginas do mapa de sombra virtual (spec 034, T060): depois do desenho principal, a
 * profundidade da cena deste quadro marca as páginas que a imagem usa (`shadow_request.wgsl`), na fatia de agora da
 * série dos pedidos; o `ShadowFlow` do quadro seguinte as lê pelo atraso 1. Sem câmera ou sem profundidade, nada é
 * gravado — a série para e o estágio de sombra recorre à reserva grossa no frustum.
 */
export class ShadowRequestFlow extends Flow<ShadowRequestSlots, 'idle'> {
    readonly type = 'ShadowRequestFlow';
    readonly slots: ShadowRequestSlots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private readonly work = new ShadowRequestWork();
    /** Os pipelines preparados (pelas amostras da profundidade). */
    private mark: string | undefined;
    private clear: string | undefined;
    /** A profundidade e os parâmetros ligados (outros = religa). */
    private boundDepth: unknown;
    private written = '';
    private active = false;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.world = ctx.world;
        const select = castingShadowMap(ctx.world);
        const work = this.work;
        this.slots = {
            caster: slot.singleton(ShadowMap.schema, { select }),
            matrices: slot.pool(ShadowMap.matrixSchema.name),
            requests: slot.channel(ShadowMap.schema, 'requests', { select }),
            sceneDepth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
            camera: slot.singleton(Camera.schema, { optional: true }),
            cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
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
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** Zera os pedidos de agora e marca os da profundidade da cena. */
    dispatch(frame: Frame, bound: BoundFlow<ShadowRequestSlots>): void {
        if (!this.active || this.mark === undefined || this.clear === undefined) return;
        const mark = bound.pipelines.get(this.mark);
        const clear = bound.pipelines.get(this.clear);
        if (mark?.role !== 'compute' || !mark.ready) return;
        if (clear?.role !== 'compute' || !clear.ready) return;
        const depth = bound.slots.sceneDepth;
        const requests = bound.slots.requests.buffer(0);
        if (depth === undefined || requests === undefined) return;
        frame.compute('ShadowRequestFlow', (pass) => {
            pass.bind.setPipeline(clear.spec);
            clear.bindTo(pass.bind);
            pass.dispatch.invocations(requests.byteSize / 4, WORKGROUP_SIZE);
            pass.bind.setPipeline(mark.spec);
            mark.bindTo(pass.bind);
            pass.dispatch.workgroups(
                Math.ceil(depth.texture.width / 8),
                Math.ceil(depth.texture.height / 8),
            );
        });
        bound.slots.requests.written();
    }

    /** Com câmera e profundidade: os parâmetros, a profundidade ligada e os pipelines das amostras dela. */
    private prepare(c: Ctx): void {
        const s = c.bound.slots;
        const sceneDepth = s.sceneDepth;
        const map = s.caster.resource;
        const mapId = this.world.entityIdOfResource(map);
        const casterSlot = mapId === undefined ? undefined : s.matrices.slotOf(mapId);
        const camera = s.camera?.resource;
        const cameraId = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        const cameraSlot = cameraId === undefined ? undefined : s.cameras?.slotOf(cameraId);
        this.active =
            sceneDepth !== undefined && casterSlot !== undefined && cameraSlot !== undefined;
        if (!this.active || sceneDepth === undefined) return;
        const key = `${casterSlot}:${cameraSlot}`;
        if (key !== this.written) {
            this.resources.writeNow(
                this.work,
                PARAMS,
                ShadowRequestParamsSchema.pack({ casterSlot, cameraSlot }),
            );
            this.written = key;
        }
        const multisampled = (sceneDepth.texture.sampleCount ?? 1) > 1;
        const params = this.resources.bufferOf(this.work, PARAMS);
        if (params === undefined) {
            this.active = false;
            return;
        }
        if (sceneDepth.view !== this.boundDepth) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [
                        multisampled
                            ? shadowRequestResources.depthMs
                            : shadowRequestResources.depth,
                        sceneDepth.view,
                    ],
                    [shadowRequestResources.params, params as BindingSource],
                ]),
            );
            this.boundDepth = sceneDepth.view;
        }
        const id = `shadow_request:${multisampled ? 'ms' : '1'}`;
        if (id === this.mark) return;
        if (this.mark !== undefined) c.release(this.mark);
        this.mark = id;
        const module = multisampled ? shadowRequest.multisampled : shadowRequest.single;
        const entry = multisampled ? 'shadow_request_ms_main' : 'shadow_request_single_main';
        c.prepare({ id, role: 'compute', shader: module, entryPoints: [entry] });
        if (this.clear === undefined) {
            this.clear = 'shadow_request_clear';
            c.prepare({
                id: this.clear,
                role: 'compute',
                shader: shadowRequest.single,
                entryPoints: ['shadow_request_clear_main'],
            });
        }
    }
}
