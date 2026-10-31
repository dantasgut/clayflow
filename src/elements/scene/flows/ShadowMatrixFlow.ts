import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Flow } from '../../../scene/flows/Flow';
import { FlowWork } from '../../../scene/flows/FlowWork';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../../scene/flows/slots';
import { DirectionalLight } from '../DirectionalLight';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import { halton, TemporalAntialiasing } from '../TemporalAntialiasing';
import {
    ShadowMatrixInstanceSchema,
    ShadowMatrixParamsSchema,
    shadowRecord,
} from './ShadowMatrixSchemas';
import { shadowMatrix } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio da matriz de sombra. */
export interface ShadowMatrixSlots extends SlotMap {
    /** Pool `Light` (direção da luz). */
    readonly lights: PoolSlot<false>;
    /** Pool `ShadowMatrix` (saída). */
    readonly matrices: PoolSlot<false>;
    /** Pool `ShadowMap` (o tamanho do mapa: o deslocamento da grade em texels). */
    readonly maps: PoolSlot<false>;
    /** Luzes direcionais com mapa de sombra: registro `ShadowRecord` e a lista das vivas (grupo único). */
    readonly casters: EntitiesSlot;
    /** O antisserrilhado da cena (spec 034): com o deslocamento da amostra, a grade do mapa anda e o PCF gira. */
    readonly antialiasing: SingletonSlot<true>;
    /** O espaço de trabalho do estágio: os parâmetros (`ShadowMatrixParams`, spec 039). */
    readonly work: WorkSlot<ShadowMatrixWork>;
}

/** Resource de trabalho do `ShadowMatrixFlow` (spec 039): os parâmetros do estágio, escritos pela CPU. */
class ShadowMatrixWork extends FlowWork {
    static readonly schema = new StructSchema('ShadowMatrixWork', {});
}

type Ctx = TransitionContext<ShadowMatrixSlots>;

/**
 * Estágio da matriz de sombra (spec 007, research R11) — produz, na GPU, a matriz luz-vista-projeção de cada
 * `DirectionalLight` que projeta sombra a partir da direção dela (pool `Light`), no pool `ShadowMatrix` (segundo
 * descritor do `ShadowMap`, mesmo slot), que o estágio de sombra e o render principal leem. A CPU não calcula a
 * matriz nem acompanha mudanças da luz: a direção chega ao pool pelo envio da C2 e o kernel a lê.
 *
 * Com o deslocamento da amostra dentro do pixel (`TemporalAntialiasing` temporal ou acumulação; spec 034, R3/R6), a
 * sombra entra na mesma sequência (o mesmo comprimento; as dimensões 5, 7 e 11 do Halton, que não se alinham ao
 * deslocamento da câmera, de bases 2 e 3): a grade do mapa anda dentro do texel e o padrão do PCF gira a cada quadro —
 * o acúmulo integra o mapa supersamplado e a média das rotações. Sem ele, a grade e o padrão parados.
 *
 * Fase `transform`, depois do `CameraFlow`. Roda todo quadro com luzes que projetam (poucas threads).
 */
export class ShadowMatrixFlow extends Flow<ShadowMatrixSlots, 'idle'> {
    readonly type = 'ShadowMatrixFlow';
    readonly slots: ShadowMatrixSlots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        {
            id: 'shadow_matrix',
            role: 'compute',
            shader: shadowMatrix,
            entryPoints: ['shadow_matrix_main'],
        },
    ];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly work: ShadowMatrixWork;
    private readonly resources: ResourceDirectory;
    private count = 0;
    private written = '';
    /** Quadros com o deslocamento da amostra (índice da sequência da sombra). */
    private frame = 0;

    constructor(ctx: FlowContext) {
        super();
        const work = new ShadowMatrixWork();
        this.work = work;
        this.resources = ctx.resources;
        // Os parâmetros: escritos pela CPU quando mudam (`writeNow`, antes da gravação do quadro).
        work.use({
            descriptors: () => [
                {
                    id: 'shadow_matrix_params',
                    role: 'uniform',
                    schema: ShadowMatrixParamsSchema,
                    upload: 'never',
                },
            ],
        });
        this.slots = {
            lights: slot.pool(Light.schema.name),
            matrices: slot.pool(ShadowMap.matrixSchema.name),
            maps: slot.pool(ShadowMap.schema.name),
            casters: slot.entities({
                all: [DirectionalLight, ShadowMap],
                record: shadowRecord,
                groups: {
                    schema: ShadowMatrixInstanceSchema,
                    key: () => 'casters',
                    instance: 'record',
                },
            }),
            antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
            work: slot.work(() => work),
        };
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

    /** Início e tamanho da lista e a posição da sequência no quadro, escritos quando mudam. */
    private writeParams(ctx: Ctx): void {
        const list = ctx.bound.slots.casters.groups[0];
        this.count = list?.count ?? 0;
        const first = list?.first ?? 0;
        const { kernelRotation, texelJitter } = this.sample(ctx);
        const key = `${first}:${this.count}:${kernelRotation.join(',')}:${texelJitter.join(',')}`;
        if (key === this.written) return;
        this.resources.writeNow(
            this.work,
            'shadow_matrix_params',
            ShadowMatrixParamsSchema.pack({
                first,
                count: this.count,
                kernelRotation,
                texelJitter,
            }),
        );
        this.written = key;
    }

    /**
     * A posição da sequência do deslocamento da amostra no quadro: o deslocamento da grade do mapa (texels, cada eixo em
     * [−½, ½)) e a rotação do padrão 3×3 (cosseno, seno; até um quarto de volta, a simetria da grade). Sem o
     * deslocamento, nenhum dos dois.
     */
    private sample(ctx: Ctx): {
        kernelRotation: readonly [number, number];
        texelJitter: readonly [number, number];
    } {
        const aa = ctx.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        if (!aa?.jitters) return { kernelRotation: [1, 0], texelJitter: [0, 0] };
        const i = (this.frame % Math.max(1, aa.data.sequence)) + 1;
        this.frame++;
        const angle = (Math.PI / 2) * halton(i, 11);
        return {
            kernelRotation: [Math.cos(angle), Math.sin(angle)],
            texelJitter: [halton(i, 5) - 0.5, halton(i, 7) - 0.5],
        };
    }
}
