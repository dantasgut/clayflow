import type { EngineCore, Frame, UniformBufferSpec } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type PoolSlot, type SlotMap } from '../../../scene/flows/slots';
import { Transform } from '../Transform';
import { transformCompose } from './shaders';
import { TransformParamsSchema } from './TransformParams';

const WORKGROUP_SIZE = 64;

/** Slots do estágio de transformação. */
export interface TransformSlots extends SlotMap {
    /** Pool das intenções `Transform` (entrada da composição). */
    readonly transforms: PoolSlot<false>;
    /** Pool das matrizes de mundo `WorldTransform` (saída). */
    readonly worlds: PoolSlot<false>;
    /** Entidades com `Transform` (remoções recompõem). */
    readonly entities: EntitiesSlot;
}

const slots: TransformSlots = {
    transforms: slot.pool(Transform.schema.name),
    worlds: slot.pool(Transform.worldSchema.name),
    entities: slot.entities({ all: [Transform] }),
};

/** `stale`: há intenção de `Transform` ainda não composta; `clean`: as matrizes de mundo estão em dia. */
export type TransformState = 'stale' | 'clean';

type Ctx = TransitionContext<TransformSlots>;

/**
 * Estágio de transformação — produz, na GPU, a matriz de mundo e a matriz de normais de cada `Transform` a partir da
 * sua intenção (posição, rotação, escala), com a convenção `M = T · R · S`. O resultado fica no pool
 * `WorldTransform` (mesmo slot do `Transform`), que os estágios de sombra e desenho leem por índice de instância.
 *
 * Slots: os pools `Transform` e `WorldTransform` (ligados por `consumes`) e as entidades com `Transform`. Reativo
 * pela tabela de transições: fica `stale` com `resourceReady` de um `Transform`, entidades inseridas ou removidas,
 * pool realocado ou bind group substituído; em `stale`, `framePrepare` escreve a contagem (uma vez por quadro) e o
 * quadro grava a composição; `frameRecorded` volta a `clean` — numa cena parada não faz nada.
 *
 * Substituível: é o estágio padrão da fase `transform`. Registrar outro Flow nessa fase permite outras regras de
 * transformação — a base para a hierarquia opcional, para a função `transform` do usuário e para cadeias não
 * euclidianas do roadmap.
 */
export class TransformFlow extends Flow<TransformSlots, TransformState> {
    readonly type = 'TransformFlow';
    readonly slots = slots;
    override readonly listens = [Transform.schema];
    override readonly pipelines: readonly PipelineDescriptor[] = [
        {
            id: 'transform_compose',
            role: 'compute',
            shader: transformCompose,
            entryPoints: ['transform_compose_main'],
            consumes: [Transform.schema.name, Transform.worldSchema.name],
        },
    ];
    override readonly bindings: {
        /** Parâmetros da composição (`TransformParams`: contagem). */
        readonly params: UniformBufferSpec;
    };
    protected readonly initialState = 'stale' as const;
    protected readonly transitions: FlowTransitions<
        TransformState,
        TransitionContext<TransformSlots>
    >;

    private readonly core: EngineCore;
    private readonly params: UniformBufferSpec;
    /** Contagem escrita em `TransformParams` (-1 = ainda não escrita). */
    private writtenCount = -1;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.params = ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'transform_compose_params',
            byteSize: TransformParamsSchema.stride,
        });
        this.bindings = { params: this.params };
        const stale = { to: 'stale' as const };
        this.transitions = {
            '*': {
                slotsResolved: stale,
                slotLost: stale,
                pipelinesCompiled: stale,
                resourceReady: stale,
                entitiesChanged: stale,
                poolReallocated: stale,
                bindGroupReplaced: stale,
            },
            stale: {
                framePrepare: {
                    to: 'stale',
                    run: (_e, c) => {
                        this.writeCount(c);
                    },
                },
                frameRecorded: { to: 'clean' },
            },
            clean: { framePrepare: 'ignore', frameRecorded: 'ignore' },
        };
    }

    /** Grava a composição quando há intenção pendente (`stale`). */
    dispatch(frame: Frame, bound: BoundFlow<TransformSlots>): void {
        if (this.state !== 'stale') return;
        const count = bound.slots.transforms.count;
        if (count === 0) return;
        const p = bound.compute('transform_compose');
        frame.compute('TransformFlow', (pass) => {
            pass.bind.setPipeline(p.spec).setBindGroup(0, p.groups[0]!);
            pass.dispatch.invocations(count, WORKGROUP_SIZE);
        });
    }

    /** Libera o uniform de parâmetros. */
    override dispose(): void {
        this.core.destroy(this.params);
    }

    /** `TransformParams.count` acompanha o pool (escrita só quando muda). */
    private writeCount(ctx: Ctx): void {
        const count = ctx.bound.slots.transforms.count;
        if (count === this.writtenCount) return;
        this.core.write(this.params, TransformParamsSchema.pack({ count }));
        this.writtenCount = count;
    }
}
