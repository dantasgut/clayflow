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
    type ChannelSlot,
    type EntitiesSlot,
    type PoolSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../../scene/flows/slots';
import type { World } from '../../../scene/world/World';
import { Camera } from '../Camera';
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
    /** Série `ShadowMatrix` (saída; o quadro anterior pelo atraso 1). */
    readonly matrices: ChannelSlot<false>;
    /** Pool `ShadowMap` (o tamanho do mapa: o deslocamento da grade em texels). */
    readonly maps: PoolSlot<false>;
    /** Luzes direcionais com mapa de sombra: registro `ShadowRecord` e a lista das vivas (grupo único). */
    readonly casters: EntitiesSlot;
    /** O antisserrilhado da cena (spec 034): com o deslocamento da amostra, as amostras andam e a penumbra gira. */
    readonly antialiasing: SingletonSlot<true>;
    /** A câmera ativa (os níveis em volta dela; sem câmera, em volta da origem). */
    readonly camera: SingletonSlot<true>;
    /** Pool das matrizes das câmeras (a posição da ativa). */
    readonly cameras: PoolSlot<true>;
    /** O espaço de trabalho do estágio: os parâmetros (`ShadowMatrixParams`, spec 039). */
    readonly work: WorkSlot<ShadowMatrixWork>;
}

/** Resource de trabalho do `ShadowMatrixFlow` (spec 039): os parâmetros do estágio, escritos pela CPU. */
class ShadowMatrixWork extends FlowWork {
    static readonly schema = new StructSchema('ShadowMatrixWork', {});
}

type Ctx = TransitionContext<ShadowMatrixSlots>;

/**
 * Estágio do referencial do mapa de sombra virtual (spec 007, research R11; spec 034, T060) — produz, na GPU, para cada
 * `DirectionalLight` que projeta sombra, a base do espaço da luz a partir da direção dela (pool `Light`), a câmera nesse
 * espaço e os níveis ativos, na série `ShadowMatrix` (segundo descritor do `ShadowMap`, mesmo slot), que o estágio de
 * sombra e o render principal leem. O referencial do quadro anterior (atraso 1) diz se o cache das páginas vale. A CPU
 * não acompanha a luz: a direção chega ao pool pelo envio da C2 e o kernel a lê.
 *
 * Com o deslocamento da amostra dentro do pixel (`TemporalAntialiasing` temporal ou acumulação; spec 034, R3/R6), a
 * sombra entra na mesma sequência (o mesmo comprimento; as dimensões 5, 7 e 11 do Halton, que não se alinham ao
 * deslocamento da câmera, de bases 2 e 3): as amostras da penumbra andam dentro do texel e o padrão gira a cada quadro —
 * o acúmulo faz a média. Sem ele, o padrão parado.
 *
 * Fase `transform`, depois do `CameraFlow`. Roda todo quadro com luzes que projetam (poucas threads).
 */
export class ShadowMatrixFlow extends Flow<ShadowMatrixSlots, 'idle'> {
    readonly type = 'ShadowMatrixFlow';
    readonly slots: ShadowMatrixSlots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        // Sem câmera: os níveis em volta da origem. Com a câmera, o pipeline `shadow_matrix:camera` (preparado quando
        // ela existe; até ficar pronto, este).
        {
            id: 'shadow_matrix',
            role: 'compute',
            shader: shadowMatrix.origin,
            entryPoints: ['shadow_matrix_origin_main'],
        },
    ];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly work: ShadowMatrixWork;
    private readonly resources: ResourceDirectory;
    private readonly world: World;
    private count = 0;
    private written = '';
    /** Há câmera ativa no quadro (o pipeline com a câmera, quando pronto) e ele já foi pedido. */
    private hasCamera = false;
    private cameraPrepared = false;
    /** Quadros com o deslocamento da amostra (índice da sequência da sombra). */
    private frame = 0;

    constructor(ctx: FlowContext) {
        super();
        const work = new ShadowMatrixWork();
        this.work = work;
        this.resources = ctx.resources;
        this.world = ctx.world;
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
            matrices: slot.poolChannel(ShadowMap.matrixSchema.name),
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
            camera: slot.singleton(Camera.schema, { optional: true }),
            cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
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
        const camera = this.hasCamera ? bound.pipelines.get('shadow_matrix:camera') : undefined;
        const p =
            camera?.role === 'compute' && camera.ready ? camera : bound.compute('shadow_matrix');
        frame.compute('ShadowMatrixFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE);
        });
        bound.slots.matrices.written();
    }

    /**
     * Início e tamanho da lista, a posição da sequência no quadro, a câmera ativa e a continuidade da série, escritos
     * quando mudam.
     */
    private writeParams(ctx: Ctx): void {
        const list = ctx.bound.slots.casters.groups[0];
        this.count = list?.count ?? 0;
        const first = list?.first ?? 0;
        const { kernelRotation, texelJitter } = this.sample(ctx);
        const camera = ctx.bound.slots.camera?.resource as Camera | undefined;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        const cameraSlot = id === undefined ? undefined : ctx.bound.slots.cameras?.slotOf(id);
        const far = camera?.data.far ?? 100;
        this.hasCamera = cameraSlot !== undefined;
        if (this.hasCamera && !this.cameraPrepared) {
            ctx.prepare({
                id: 'shadow_matrix:camera',
                role: 'compute',
                shader: shadowMatrix.camera,
                entryPoints: ['shadow_matrix_main'],
            });
            this.cameraPrepared = true;
        }
        // O quadro anterior da série vale (gravado no quadro imediatamente anterior).
        const previousValid = ctx.bound.slots.matrices.age(1) === 1 ? 1 : 0;
        const values = {
            first,
            count: this.count,
            kernelRotation,
            texelJitter,
            cameraSlot: cameraSlot ?? 0,
            hasCamera: cameraSlot === undefined ? 0 : 1,
            far,
            previousValid,
        };
        const key = JSON.stringify(values);
        if (key === this.written) return;
        this.resources.writeNow(
            this.work,
            'shadow_matrix_params',
            ShadowMatrixParamsSchema.pack(values),
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
