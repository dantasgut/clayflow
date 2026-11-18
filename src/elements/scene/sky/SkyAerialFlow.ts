import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, TextureViewSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type PoolSlot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import type { World } from '../../../scene/world/World';
import { Camera } from '../Camera';
import { Sky, SKY_AERIAL_SIZE } from './Sky';
import { skyAerialKernel, skyOutputs } from './shaders';

/** Slots do estágio da perspectiva aérea. */
export interface SkyAerialSlots extends SlotMap {
    /** O céu da cena. */
    readonly sky: SingletonSlot<false>;
    /** A câmera ativa (a tabela é dela). */
    readonly camera: SingletonSlot<true>;
    /** As matrizes das câmeras (o slot da ativa). */
    readonly cameras: PoolSlot<true>;
}

type Ctx = TransitionContext<SkyAerialSlots>;

const AERIAL: PipelineDescriptor = {
    id: 'sky_aerial',
    role: 'compute',
    shader: skyAerialKernel,
    entryPoints: ['sky_aerial_main'],
};

/** Ids das tabelas escritas, na ordem das saídas. */
const TABLES = ['aerial', 'aerialTransmittance', 'aerialShadow'] as const;

/**
 * SkyAerialFlow — a perspectiva aérea da câmera ativa (spec 041, R10; fase `shadow`, depois da luz das nuvens e antes do
 * ambiente do céu, das sondas e do desenho): a tabela 32³ da luz espalhada e da transmitância da câmera até cada fatia,
 * com a luz simples sombreada pelo que tapa o sol no ar (`light_transmission`: a sombra das nuvens pelo mapa visto do sol
 * do quadro, escrito pela `CloudLightFlow` — os raios crepusculares), e o déficit dessa sombra no fundo, por coluna. Com a
 * tabela escrita, a atmosfera entra na geometria (`scene_fog`) e o déficit no fundo (`scene_background`). Sem câmera,
 * nada.
 */
export class SkyAerialFlow extends Flow<SkyAerialSlots, 'idle'> {
    readonly type = 'SkyAerialFlow';
    readonly slots: SkyAerialSlots = {
        sky: slot.singleton(Sky.schema),
        camera: slot.singleton(Camera.schema, { optional: true }),
        cameras: slot.pool(Camera.matricesSchema.name, { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly world: World;
    /** Tabelas ligadas às saídas (outras = religa). */
    private bound: readonly (TextureViewSpec | undefined)[] = [];
    /** Há câmera e as tabelas: a perspectiva aérea é gravada neste quadro. */
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
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    /** A tabela da câmera ativa, a cada quadro. */
    dispatch(frame: Frame, bound: BoundFlow<SkyAerialSlots>): void {
        const sky = bound.slots.sky.resource as Sky;
        const p = bound.pipelines.get(AERIAL.id);
        if (!this.active || p?.role !== 'compute' || !p.ready) {
            if (!this.active) sky.setAerial(false);
            return;
        }
        frame.compute('SkyAerialFlow.sky_aerial', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            // Um grupo de `SKY_AERIAL_SIZE[2]` invocações (as fatias) por coluna.
            pass.dispatch.invocations(
                SKY_AERIAL_SIZE[0] * SKY_AERIAL_SIZE[1] * SKY_AERIAL_SIZE[2],
                SKY_AERIAL_SIZE[2],
            );
        });
        // A tabela escrita: a atmosfera entra na geometria (`scene_fog`) e o déficit da sombra no fundo.
        sky.setAerial(true);
    }

    /** Com câmera: as tabelas alocadas, ligadas às saídas do kernel e o slot da câmera nos parâmetros do céu. */
    private prepare(c: Ctx): void {
        const sky = c.bound.slots.sky.resource as Sky;
        const camera = c.bound.slots.camera?.resource;
        const id = camera === undefined ? undefined : this.world.entityIdOfResource(camera);
        const cameraSlot = id === undefined ? undefined : c.bound.slots.cameras?.slotOf(id);
        this.active = false;
        if (cameraSlot === undefined) return;
        for (const t of TABLES) this.resources.ensureAllocated(sky, t);
        const views = TABLES.map((t) => c.bound.slots.sky.textureViewOf(t));
        if (views.some((v) => v === undefined)) return;
        if (views.some((v, k) => v !== this.bound[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [skyOutputs.aerial, views[0]!],
                    [skyOutputs.aerialTransmittance, views[1]!],
                    [skyOutputs.aerialShadow, views[2]!],
                ]),
            );
            if (this.bound.length === 0) c.prepare(AERIAL);
            this.bound = views;
        }
        if (sky.data.cameraSlot !== cameraSlot) sky.data.cameraSlot = cameraSlot;
        this.active = true;
    }
}
