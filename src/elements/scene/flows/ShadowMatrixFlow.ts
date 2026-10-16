import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { EngineCore, Frame, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type PoolSlot, type SlotMap } from '../../../scene/flows/slots';
import { DirectionalLight } from '../DirectionalLight';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import {
    ShadowMatrixInstanceSchema,
    ShadowMatrixParamsSchema,
    shadowRecord,
} from './ShadowMatrixSchemas';
import { shadowMatrix, shadowMatrixResources } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio da matriz de sombra. */
export interface ShadowMatrixSlots extends SlotMap {
    /** Pool `Light` (direção da luz). */
    readonly lights: PoolSlot<false>;
    /** Pool `ShadowMatrix` (saída). */
    readonly matrices: PoolSlot<false>;
    /** Luzes direcionais com mapa de sombra: registro `ShadowRecord` e a lista das vivas (grupo único). */
    readonly casters: EntitiesSlot;
}

const slots: ShadowMatrixSlots = {
    lights: slot.pool(Light.schema.name),
    matrices: slot.pool(ShadowMap.matrixSchema.name),
    casters: slot.entities({
        all: [DirectionalLight, ShadowMap],
        record: shadowRecord,
        groups: { schema: ShadowMatrixInstanceSchema, key: () => 'casters', instance: 'record' },
    }),
};

type Ctx = TransitionContext<ShadowMatrixSlots>;

/**
 * Estágio da matriz de sombra (spec 007, research R11) — produz, na GPU, a matriz luz-vista-projeção de cada
 * `DirectionalLight` que projeta sombra a partir da direção dela (pool `Light`), no pool `ShadowMatrix` (segundo
 * descritor do `ShadowMap`, mesmo slot), que o estágio de sombra e o render principal leem. A CPU não calcula a
 * matriz nem acompanha mudanças da luz: a direção chega ao pool pelo envio da C2 e o kernel a lê.
 *
 * Fase `transform`, depois do `CameraFlow`. Roda todo quadro com luzes que projetam (poucas threads).
 */
export class ShadowMatrixFlow extends Flow<ShadowMatrixSlots, 'idle'> {
    readonly type = 'ShadowMatrixFlow';
    readonly slots = slots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        {
            id: 'shadow_matrix',
            role: 'compute',
            shader: shadowMatrix,
            entryPoints: ['shadow_matrix_main'],
            consumes: [],
        },
    ];
    /** Recurso privado: parâmetros do estágio (`ShadowMatrixParams`). */
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly params: UniformBufferSpec;
    private count = 0;
    private written = '';

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'shadow_matrix_params',
            byteSize: ShadowMatrixParamsSchema.stride,
        });
        this.bindings = new Map<WgslResource, BindingSource>([
            [shadowMatrixResources.params, this.params],
        ]);
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                entitiesChanged: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.writeParams(c);
                    },
                },
            },
        };
    }

    /** Grava o cálculo das matrizes das luzes vivas. */
    dispatch(frame: Frame, bound: BoundFlow<ShadowMatrixSlots>): void {
        if (this.count === 0) return;
        const p = bound.compute('shadow_matrix');
        frame.compute('ShadowMatrixFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE);
        });
    }

    /** Libera o uniform de parâmetros. */
    override dispose(): void {
        this.core.destroy(this.params);
    }

    /** Início e tamanho da lista, escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
        const list = ctx.bound.slots.casters.groups[0];
        this.count = list?.count ?? 0;
        const first = list?.first ?? 0;
        const key = `${first}:${this.count}`;
        if (key === this.written) return;
        this.core.write(this.params, ShadowMatrixParamsSchema.pack({ first, count: this.count }));
        this.written = key;
    }
}
