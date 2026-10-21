import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { EngineCore, Frame, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { PoolDirectory } from '../../../scene/contracts/PoolDirectory';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
} from '../../../scene/flows/slots';
import { ExtensionPipelines } from '../../../scene/flows/ExtensionPipelines';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { Time } from '../../../scene/time/Time';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';
import { PerStepUniforms } from '../../gpu/compute/PerStepUniforms';
import { CameraFunction } from '../../extension/CameraFunction';
import type { World } from '../../../scene/world/World';
import { Camera } from '../Camera';
import { Transform } from '../Transform';
import { pixelJitter, TemporalAntialiasing } from '../TemporalAntialiasing';
import {
    CameraComposeParamsSchema,
    CameraFnEntrySchema,
    CameraFnGroupSchema,
    CameraInstanceSchema,
    cameraRecord,
} from './CameraSchemas';
import { cameraCompose, cameraComposeFn, cameraPoint, cameraResources as R } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio de câmera. */
export interface CameraSlots extends SlotMap {
    /** Pool dos parâmetros (`Camera`): o estágio espera a primeira câmera. */
    readonly params: PoolSlot<false>;
    /** Pool das matrizes (`CameraMatrices`, saída). */
    readonly matrices: PoolSlot<false>;
    /** Pool `WorldTransform` (matriz de mundo da câmera). */
    readonly worlds: PoolSlot<false>;
    /** Câmeras com `Transform`: registro `CameraRecord` e a lista das vivas (grupo único). */
    readonly views: EntitiesSlot;
    /** Toda entidade com `Camera` (a falta do `Transform` é erro). */
    readonly cameras: EntitiesSlot;
    /** Câmeras com `CameraFunction` (spec 009; registros nos pools das formas, spec 031). */
    readonly functions: EntitiesSlot;
    /** Relógio da cena (tempo simulado das funções; sem relógio, 0). */
    readonly time: SingletonSlot<true>;
    /** Antisserrilhado da cena (spec 034): sem ele, ou fora do modo temporal/acumulação, nenhum deslocamento. */
    readonly antialiasing: SingletonSlot<true>;
}

const slots: CameraSlots = {
    params: slot.pool(Camera.schema.name),
    matrices: slot.pool(Camera.matricesSchema.name),
    worlds: slot.pool(Transform.worldSchema.name),
    views: slot.entities({
        all: [Camera, Transform],
        record: cameraRecord,
        groups: { schema: CameraInstanceSchema, key: () => 'cameras', instance: 'record' },
    }),
    cameras: slot.entities({ all: [Camera] }),
    functions: slot.entities({ all: [Camera, Transform, CameraFunction] }),
    time: slot.singleton(Time.schema, { optional: true }),
    antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
};

/** Câmeras com função reservadas na lista no primeiro uso (cresce em potências de 2). */
const MIN_FN_CAMERAS = 8;

type Ctx = TransitionContext<CameraSlots>;

/**
 * Estágio de câmera (spec 007, research R10) — produz, na GPU, view, projection, viewProjection e a posição de cada
 * câmera a partir dos seus parâmetros (`Camera`) e da matriz de mundo do seu `Transform` (`WorldTransform`, composta
 * antes na mesma fase), no pool `CameraMatrices`. A razão de aspecto das câmeras `aspectMode: 'canvas'` vem do canvas
 * (uniform do estágio, escrito quando o tamanho muda) — a CPU não calcula matriz de câmera.
 *
 * Fase `transform`, prioridade abaixo do `TransformFlow`. Roda todo quadro com câmeras (poucas threads). Uma `Camera`
 * sem `Transform` na entidade é erro (nomeia a entidade).
 */
export class CameraFlow extends Flow<CameraSlots, 'idle'> {
    readonly type = 'CameraFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        {
            id: 'camera_compose',
            role: 'compute',
            shader: cameraCompose,
            entryPoints: ['camera_compose_main'],
        },
    ];
    /** Os registros de todas as formas das funções `camera` (spec 031, R8). */
    override readonly listens = [cameraPoint];
    /**
     * Recursos privados: parâmetros do estágio (`CameraComposeParams`), as entradas `CameraFnEntry` (slot da câmera,
     * slot do Transform, slot do registro no pool da forma) das câmeras com função agrupadas por função, e
     * trecho/tempo/razão do canvas de cada grupo de função (offset dinâmico).
     */
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    /** Pools da C2: o slot do registro de cada função, no pool da forma dela. */
    private readonly pools: PoolDirectory;
    private readonly params: UniformBufferSpec;
    private count = 0;
    private written = '';
    /** Pipelines das `CameraFunction` presentes (um por código). */
    private readonly fnPipelines = new ExtensionPipelines<CameraFunction>();
    private fnDirty = false;
    private fnGroups: readonly {
        readonly id: string;
        readonly first: number;
        readonly count: number;
    }[] = [];
    private fnList: StorageBufferSpec;
    private fnCapacity = MIN_FN_CAMERAS;
    private readonly fnGroupUniforms: PerStepUniforms;
    /** Quadros gravados (índice da sequência do deslocamento da amostra; conta quadros de imagem, não passos). */
    private frame = 0;
    /** Deslocamento do quadro (NDC xy, pixels zw). */
    private jitter: readonly [number, number, number, number] = [0, 0, 0, 0];
    /** Câmeras com `cut` ligado já enviado num quadro (desligado no seguinte). */
    private readonly cutSent = new Set<Camera>();

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.pools = ctx.resources;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'camera_compose_params',
            byteSize: CameraComposeParamsSchema.stride,
        });
        this.fnList = this.createList(MIN_FN_CAMERAS);
        this.fnGroupUniforms = new PerStepUniforms(ctx.core, {
            discriminator: 'camera_fn_groups',
            schema: CameraFnGroupSchema,
        });
        this.fnGroupUniforms.reserve(1);
        this.bindings = new Map<WgslResource, BindingSource>([
            [R.compose, this.params],
            [R.fnList, this.fnList],
            [R.fnGroup, this.fnGroupUniforms.source()],
        ]);
        const fnChanged = {
            to: 'idle' as const,
            run: (): void => {
                this.fnDirty = true;
            },
        };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.requireTransform(c.bound.slots.cameras.entries.map((e) => e.entityId));
                        this.fnDirty = true;
                    },
                },
                slotLost: fnChanged,
                slotChanged: fnChanged,
                pipelinesCompiled: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type !== 'pipelinesCompiled' || e.pipeline === undefined) return;
                        if (this.fnPipelines.compiled(e.pipeline, c).length > 0)
                            this.fnDirty = true;
                    },
                },
                pipelineRejected: {
                    to: 'idle',
                    run: (e, c) => {
                        if (e.type === 'pipelineRejected') this.fnPipelines.rejected(e.pipeline, c);
                    },
                },
                // Registro de função escrito: valores (nada a fazer) ou código novo (revisão).
                poolWritten: fnChanged,
                bindGroupReplaced: 'ignore',
                poolReallocated: fnChanged,
                entitiesChanged: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type !== 'entitiesChanged') return;
                        if (e.slot === 'cameras') this.requireTransform(e.added);
                        this.fnDirty = true;
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        // O corte recomeça a sequência: a acumulação depois dele usa o prefixo da sequência de baixa
                        // discrepância, e a imagem não depende de quantos quadros vieram antes (a prontidão).
                        if (this.clearCuts(c)) this.frame = 0;
                        this.updateJitter(c);
                        this.writeParams(c);
                        this.syncFunctions(c);
                        this.writeGroups(c);
                    },
                },
            },
        };
    }

    /** Grava a composição das câmeras vivas. */
    dispatch(frame: Frame, bound: BoundFlow<CameraSlots>): void {
        if (this.count === 0) return;
        const p = bound.compute('camera_compose');
        frame.compute('CameraFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE);
        });
        // Câmeras com função: um despacho por função, sobre as matrizes padrão (spec 009).
        this.fnGroups.forEach((group, k) => {
            const fn = bound.compute(group.id);
            if (!fn.ready) return;
            frame.compute('CameraFlow.function', (pass) => {
                pass.bind.setPipeline(fn.spec);
                fn.bindTo(pass.bind, { draw: [this.fnGroupUniforms.offset(k)] });
                pass.dispatch.invocations(group.count, WORKGROUP_SIZE);
            });
        });
    }

    /** Libera o uniform de parâmetros e as listas das funções. */
    override dispose(): void {
        this.core.destroy(this.params);
        this.core.destroy(this.fnList);
        this.fnGroupUniforms.dispose();
    }

    /** Funções presentes: pipelines por código (ativos ao compilar) e a lista por grupo refeita. */
    private syncFunctions(ctx: Ctx): void {
        if (!this.fnDirty) return;
        this.fnDirty = false;
        const { functions, params, worlds } = ctx.bound.slots;
        const present = functions.entries.map((e) => e.get(CameraFunction));
        // Um pipeline por código (`camera_fn:<módulo>`), compartilhado pelas funções com o mesmo código.
        for (const fn of present) {
            const module = fn.module;
            this.fnPipelines.select(
                fn,
                { key: module.name, id: `camera_fn:${module.name}` },
                ({ id }) =>
                    ctx.prepare({
                        id,
                        role: 'compute',
                        shader: bindPoints(cameraComposeFn, new Map([[cameraPoint, module]])),
                        entryPoints: ['camera_compose_fn_main'],
                        verify: true,
                        extensions: [fn],
                    }).ready,
            );
        }
        this.fnPipelines.retain(ctx, present);
        const byId = new Map<string, { camera: number; world: number; record: number }[]>();
        for (const entry of functions.entries) {
            const fn = entry.get(CameraFunction);
            const id = this.fnPipelines.active(fn)?.id;
            if (id === undefined) continue;
            const c = params.slotOf(entry.entityId);
            const t = worlds.slotOf(entry.entityId);
            const r = this.pools.poolSlotOf(fn.record.name, entry.entityId);
            if (c === undefined || t === undefined || r === undefined) continue;
            let list = byId.get(id);
            if (list === undefined) byId.set(id, (list = []));
            list.push({ camera: c, world: t, record: r });
        }
        const groups: { id: string; first: number; count: number }[] = [];
        let total = 0;
        for (const [id, list] of byId) {
            groups.push({ id, first: total, count: list.length });
            total += list.length;
        }
        this.fnGroups = groups;
        if (total === 0) return;
        if (total > this.fnCapacity) {
            let capacity = this.fnCapacity;
            while (capacity < total) capacity *= 2;
            this.core.destroy(this.fnList);
            this.fnList = this.createList(capacity);
            this.fnCapacity = capacity;
            ctx.bind(new Map([[R.fnList, this.fnList]]));
        }
        const data = new Uint8Array(total * CameraFnEntrySchema.stride);
        let at = 0;
        for (const list of byId.values()) {
            for (const e of list) {
                CameraFnEntrySchema.packInto(data, at * CameraFnEntrySchema.stride, e);
                at++;
            }
        }
        this.core.write(this.fnList, data);
    }

    /** Trecho, tempo simulado e razão do canvas de cada grupo de função (todo quadro com funções). */
    private writeGroups(ctx: Ctx): void {
        if (this.fnGroups.length === 0) return;
        if (this.fnGroupUniforms.reserve(this.fnGroups.length))
            ctx.bind(new Map([[R.fnGroup, this.fnGroupUniforms.source()]]));
        const time = (ctx.bound.slots.time?.resource as Time | undefined)?.simulated ?? 0;
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        const aspect = height > 0 ? width / height : 1;
        this.fnGroups.forEach((g, k) => {
            this.fnGroupUniforms.write(k, {
                first: g.first,
                count: g.count,
                time,
                canvas_aspect: aspect,
                jitter: this.jitter,
            });
        });
        this.fnGroupUniforms.flush(this.fnGroups.length);
    }

    private createList(capacity: number): StorageBufferSpec {
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `camera_fn_list:${capacity}`,
            byteSize: capacity * CameraFnEntrySchema.stride,
        });
    }

    /** Início e tamanho da lista e a razão do canvas, escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
        const list = ctx.bound.slots.views.groups[0];
        this.count = list?.count ?? 0;
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        const values = {
            first: list?.first ?? 0,
            count: this.count,
            canvas_aspect: height > 0 ? width / height : 1,
            jitter: this.jitter,
        };
        const key = `${values.first}:${values.count}:${values.canvas_aspect}:${this.jitter.join(',')}`;
        if (key === this.written) return;
        this.core.write(this.params, CameraComposeParamsSchema.pack(values));
        this.written = key;
    }

    /**
     * Deslocamento da amostra dentro do pixel do quadro (spec 034, R3): Halton (2, 3) com o antisserrilhado temporal ou a
     * acumulação; em NDC (y para cima) e em pixels do alvo.
     */
    private updateJitter(ctx: Ctx): void {
        const aa = ctx.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        if (!aa?.jitters) {
            this.jitter = [0, 0, 0, 0];
            return;
        }
        const { width, height } = this.core.canvasSize() ?? { width: 1, height: 1 };
        const [px, py] = pixelJitter(this.frame, aa.data.sequence);
        this.frame++;
        this.jitter = [(2 * px) / Math.max(1, width), (-2 * py) / Math.max(1, height), px, py];
    }

    /**
     * `cut` vale um quadro: as câmeras que o enviaram no quadro anterior voltam a 0. Devolve se alguma câmera envia o
     * corte neste quadro.
     */
    private clearCuts(ctx: Ctx): boolean {
        let sending = false;
        for (const entry of ctx.bound.slots.cameras.entries) {
            const camera = entry.get(Camera);
            if (camera.data.cut === 0) {
                this.cutSent.delete(camera);
                continue;
            }
            if (this.cutSent.has(camera)) {
                camera.data.cut = 0;
                this.cutSent.delete(camera);
            } else {
                this.cutSent.add(camera);
                sending = true;
            }
        }
        return sending;
    }

    /** Toda `Camera` precisa de um `Transform` na mesma entidade (posição e orientação). */
    private requireTransform(ids: readonly Parameters<World['resourcesOf']>[0][]): void {
        for (const id of ids) {
            if (this.world.resourcesOf(id).some((r) => r instanceof Transform)) continue;
            throw new Error(
                `CameraFlow: a Camera da entidade ${id} não tem Transform — adicione um Transform à câmera `
                    + '(posição e orientação; Transform.lookRotation mira um ponto).',
            );
        }
    }
}
