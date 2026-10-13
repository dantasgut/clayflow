import type { EngineCore, Frame, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type PoolSlot, type SlotMap } from '../../../scene/flows/slots';
import type { World } from '../../../scene/world/World';
import { Camera } from '../Camera';
import { Transform } from '../Transform';
import { CameraComposeParamsSchema, CameraInstanceSchema, cameraRecord } from './CameraSchemas';
import { cameraCompose } from './shaders';

const WORKGROUP_SIZE = 64;

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
};

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
            consumes: [
                Camera.schema.name,
                Camera.matricesSchema.name,
                Transform.worldSchema.name,
                cameraRecord.schema.name,
                CameraInstanceSchema.name,
            ],
        },
    ];
    override readonly bindings: {
        /** Parâmetros do estágio (`CameraComposeParams`). */
        readonly compose: UniformBufferSpec;
    };
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly world: World;
    private readonly params: UniformBufferSpec;
    private count = 0;
    private written = '';

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.world = ctx.world;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'camera_compose_params',
            byteSize: CameraComposeParamsSchema.stride,
        });
        this.bindings = { compose: this.params };
        this.transitions = {
            '*': {
                slotsResolved: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.requireTransform(c.bound.slots.cameras.entries.map((e) => e.entityId));
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                entitiesChanged: {
                    to: 'idle',
                    run: (e) => {
                        if (e.type === 'entitiesChanged' && e.slot === 'cameras')
                            this.requireTransform(e.added);
                    },
                },
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.writeParams(c);
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
            pass.bind.setPipeline(p.spec).setBindGroup(0, p.groups[0]!);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE);
        });
    }

    /** Libera o uniform de parâmetros. */
    override dispose(): void {
        this.core.destroy(this.params);
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
        };
        const key = `${values.first}:${values.count}:${values.canvas_aspect}`;
        if (key === this.written) return;
        this.core.write(this.params, CameraComposeParamsSchema.pack(values));
        this.written = key;
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
