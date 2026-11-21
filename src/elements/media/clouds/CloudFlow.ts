import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame, IndirectBufferSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../../scene/flows/slots';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { Sky } from '../../scene/sky/Sky';
import { CloudLayer } from './CloudLayer';
import {
    CLOUD_TILE,
    cloudHistorySlots,
    cloudMarchKernel,
    cloudOutputs,
    cloudReconstructKernel,
    cloudResources,
    cloudTiles,
    cloudTilesKernel,
    cloudUpsampleKernel,
    cloudWindAtPoint,
    cloudWindWeather,
} from './shaders';
import { bindPoints } from '../../../scene/shaders/bindPoints';

/** Ids dos pipelines da lista dos blocos com nuvem e dos argumentos do despacho da composição (T074). */
const TILES_ID = 'cloud_tiles';
const TILE_ARGS_ID = 'cloud_tile_args';

/** Slots do estágio da marcha das nuvens. */
export interface CloudSlots extends SlotMap {
    readonly cloud: SingletonSlot<false>;
    readonly sky: SingletonSlot<true>;
    /** A profundidade da cena (depois da água). */
    readonly sceneDepth: TextureSlot<true>;
    /** As séries da marcha (spec 037). */
    readonly cloudMarch: ChannelSlot<false>;
    readonly cloudMarchDepth: ChannelSlot<false>;
}

type Ctx = TransitionContext<CloudSlots>;

/**
 * CloudFlow — as nuvens na tela (spec 041, R1, R2; fase `forward`, depois da água — a última superfície que escreve
 * profundidade — e antes da composição do céu): a marcha de um pixel por bloco 2 × 2 do alvo de ¼ (Bayer), a
 * reconstrução temporal pela série da marcha (o canal temporal da 037: lida pelo atraso 1, escrita no atraso 0 e
 * girada) e o aumento para a tela pela profundidade, que o `SkyCompositeFlow` compõe. O aumento marca os blocos da
 * tela em que a composição muda a cor, e a lista deles e os argumentos do despacho indireto da composição saem da GPU
 * (T074: numa sala fechada, zero blocos). Os pipelines seguem as amostras da profundidade da cena. Sem `Sky`, nada.
 */
export class CloudFlow extends Flow<CloudSlots, 'idle'> {
    readonly type = 'CloudFlow';
    readonly slots: CloudSlots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private views: readonly unknown[] = [];
    private march: string | undefined;
    private upsample: string | undefined;
    private reconstruct: string | undefined;
    /** O passe por bloco do histórico nos marchados (o mesmo módulo da reconstrução). */
    private check: string | undefined;
    private active = false;
    /** Os pipelines da lista dos blocos preparados. */
    private tilesPrepared = false;
    /** A camada das ligações privadas. */
    private layer: CloudLayer | undefined;
    /** As palavras da lista dos blocos com nuvem (T074): o despacho indireto da composição. */
    private tileArgs: IndirectBufferSpec | undefined;

    /** `targets`: o schema dos alvos do quadro (`FrameTargets`), de onde vem a profundidade da cena. */
    constructor(ctx: FlowContext, targets: StructSchema) {
        super();
        this.resources = ctx.resources;
        this.slots = {
            cloud: slot.singleton(CloudLayer.schema),
            sky: slot.singleton(Sky.schema, { optional: true }),
            sceneDepth: slot.texture(targets, 'depth', { optional: true }),
            ...cloudHistorySlots,
        };
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
                // A camada redescrita (o perfil mudou o tamanho dos alvos): as saídas privadas são religadas às texturas novas
                // antes de os grupos serem refeitos (o `framePrepare` viria depois, com o grupo já pedindo a vista destruída).
                slotChanged: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                pipelineRejected: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
                canvasReconfigured: 'ignore',
            },
        };
    }

    /** A marcha, a reconstrução (a série gira) e o aumento. */
    dispatch(frame: Frame, bound: BoundFlow<CloudSlots>): void {
        if (!this.active || this.march === undefined || this.upsample === undefined) return;
        const march = bound.pipelines.get(this.march);
        if (this.reconstruct === undefined || this.check === undefined) return;
        const reconstruct = bound.pipelines.get(this.reconstruct);
        const check = bound.pipelines.get(this.check);
        const upsample = bound.pipelines.get(this.upsample);
        if (
            march?.role !== 'compute'
            || !march.ready
            || reconstruct?.role !== 'compute'
            || !reconstruct.ready
            || check?.role !== 'compute'
            || !check.ready
            || upsample?.role !== 'compute'
            || !upsample.ready
        )
            return;
        const depth = bound.slots.sceneDepth;
        if (depth === undefined) return;
        const w = depth.texture.width;
        const h = depth.texture.height;
        // O alvo reconstruído (S pixels da tela por texel, pelo perfil) e um bloco 2 × 2 dele por invocação da marcha.
        const scale = (bound.slots.cloud.resource as CloudLayer).quality.marchScale;
        const quarter = [Math.ceil(w / scale), Math.ceil(h / scale)];
        const blocks = [Math.ceil(w / (2 * scale)), Math.ceil(h / (2 * scale))];
        frame.compute('CloudFlow.march', (pass) => {
            pass.bind.setPipeline(march.spec);
            march.bindTo(pass.bind);
            pass.dispatch.invocations(blocks[0]! * blocks[1]!, WORKGROUP_SIZE.value);
        });
        frame.compute('CloudFlow.check', (pass) => {
            pass.bind.setPipeline(check.spec);
            check.bindTo(pass.bind);
            pass.dispatch.invocations(blocks[0]! * blocks[1]!, WORKGROUP_SIZE.value);
        });
        frame.compute('CloudFlow.reconstruct', (pass) => {
            pass.bind.setPipeline(reconstruct.spec);
            reconstruct.bindTo(pass.bind);
            pass.dispatch.invocations(quarter[0]! * quarter[1]!, WORKGROUP_SIZE.value);
        });
        bound.slots.cloudMarch.written();
        bound.slots.cloudMarchDepth.written();
        // Um grupo por bloco de `CLOUD_TILE`² pixels (o aumento marca os blocos com nuvem); a lista e os argumentos.
        const tiles = Math.ceil(w / CLOUD_TILE.value) * Math.ceil(h / CLOUD_TILE.value);
        const group = CLOUD_TILE.value * CLOUD_TILE.value;
        frame.compute('CloudFlow.upsample', (pass) => {
            pass.bind.setPipeline(upsample.spec);
            upsample.bindTo(pass.bind);
            pass.dispatch.invocations(tiles * group, group);
        });
        const list = bound.pipelines.get(TILES_ID);
        const args = bound.pipelines.get(TILE_ARGS_ID);
        if (list?.role !== 'compute' || !list.ready || args?.role !== 'compute' || !args.ready)
            return;
        frame.compute('CloudFlow.tiles', (pass) => {
            pass.bind.setPipeline(list.spec);
            list.bindTo(pass.bind);
            pass.dispatch.invocations(tiles, WORKGROUP_SIZE.value);
            pass.bind.setPipeline(args.spec);
            args.bindTo(pass.bind);
            pass.dispatch.workgroups(1);
        });
    }

    override dispose(): void {}


    /** Solta os pipelines e as ligações (sem céu nada roda). */
    private release(c: Ctx): void {
        this.active = false;
        if (this.reconstruct !== undefined) c.release(this.reconstruct);
        if (this.check !== undefined) c.release(this.check);
        if (this.march !== undefined) c.release(this.march);
        if (this.upsample !== undefined) c.release(this.upsample);
        this.reconstruct = undefined;
        this.check = undefined;
        this.march = undefined;
        this.upsample = undefined;
        this.views = [];
        this.tileArgs = undefined;
        if (this.tilesPrepared) {
            c.release(TILES_ID);
            c.release(TILE_ARGS_ID);
        }
        this.tilesPrepared = false;
    }

    /**
     * A reconstrução e o passe por bloco do histórico nos marchados (sem e com amostras), com o vento do tempo no lugar
     * `cloud_wind_at` quando há tempo.
     */
    private prepareReconstruct(c: Ctx, id: string, multisampled: boolean, weather: boolean): void {
        const kernel = multisampled
            ? cloudReconstructKernel.multisampled
            : cloudReconstructKernel.single;
        const shader = weather
            ? bindPoints(kernel, new Map([[cloudWindAtPoint, cloudWindWeather]]))
            : kernel;
        if (this.check !== undefined) c.release(this.check);
        const check = id.replace('cloud_reconstruct', 'cloud_check');
        c.prepare({ id: check, role: 'compute', shader, entryPoints: ['cloud_check_main'] });
        c.prepare({ id, role: 'compute', shader, entryPoints: ['cloud_reconstruct_main'] });
        this.check = check;
        this.reconstruct = id;
    }

    private prepare(c: Ctx): void {
        const cloud = c.bound.slots.cloud.resource as CloudLayer;
        const depth = c.bound.slots.sceneDepth;
        if (c.bound.slots.sky === undefined) {
            // O céu saiu: os pipelines (que leem o uniforme dele) saem junto — nenhum fica esperando, e o motor fica
            // pronto; voltando, são preparados de novo.
            this.release(c);
            return;
        }
        // Outra camada (a troca, o A/B do tempo): as ligações privadas eram das saídas da anterior — soltas antes de o
        // grupo ser refeito.
        if (cloud !== this.layer) {
            this.release(c);
            this.layer = cloud;
        }
        this.active = depth !== undefined;
        if (!this.active || depth === undefined) return;
        for (const id of [
            'trace',
            'traceDepth',
            'check',
            'checkNoise',
            'march',
            'marchDepth',
            'view',
            'tiles',
            'tileList',
            'tileArgs',
        ])
            this.resources.ensureAllocated(cloud, id);
        const views = (
            ['trace', 'traceDepth', 'view', 'check', 'checkNoise', 'tiles', 'tileList'] as const
        ).map((id) => c.bound.slots.cloud.textureViewOf(id));
        const args = this.resources.bufferOf(cloud, 'tileArgs');
        this.tileArgs = args?.subkind === 'indirect' ? args : undefined;
        if (views.some((v) => v === undefined) || this.tileArgs === undefined) {
            // As saídas ainda não alocadas (a camada entrou ou foi redescrita): nada ligado a uma vista que não existe.
            this.release(c);
            return;
        }
        const multisampled = (depth.texture.sampleCount ?? 1) > 1;
        const sources = [...views, depth.view, this.tileArgs];
        if (sources.some((v, k) => v !== this.views[k])) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [cloudOutputs.trace, views[0]!],
                    [cloudOutputs.traceDepth, views[1]!],
                    [cloudOutputs.view, views[2]!],
                    [cloudOutputs.check, views[3]!],
                    [cloudOutputs.checkNoise, views[4]!],
                    [cloudTiles.marksOut, views[5]!],
                    [cloudTiles.marks, views[5]!],
                    [cloudTiles.listOut, views[6]!],
                    [cloudTiles.args, this.tileArgs],
                    [
                        multisampled ? cloudResources.sceneDepthMs : cloudResources.sceneDepth,
                        depth.view,
                    ],
                ]),
            );
            this.views = sources;
        }
        if (!this.tilesPrepared) {
            this.tilesPrepared = true;
            c.prepare({
                id: TILES_ID,
                role: 'compute',
                shader: cloudTilesKernel,
                entryPoints: ['cloud_tiles_main'],
            });
            c.prepare({
                id: TILE_ARGS_ID,
                role: 'compute',
                shader: cloudTilesKernel,
                entryPoints: ['cloud_tile_args_main'],
            });
        }
        const variant = multisampled ? 'ms' : '1';
        const marchId = `cloud_march:${variant}`;
        // Com o tempo (R19), a reconstrução reprojeta pelo vento do quadrado do tempo no ponto da nuvem (o estado do tempo
        // anda com ele); sem, pelo vento uniforme da camada.
        const weather = cloud.weather !== undefined;
        const reconstructId = `cloud_reconstruct:${variant}${weather ? ':weather' : ''}`;
        if (marchId === this.march && reconstructId !== this.reconstruct) {
            if (this.reconstruct !== undefined) c.release(this.reconstruct);
            this.prepareReconstruct(c, reconstructId, multisampled, weather);
        }
        if (marchId !== this.march) {
            if (this.march !== undefined) c.release(this.march);
            if (this.reconstruct !== undefined) c.release(this.reconstruct);
            if (this.upsample !== undefined) c.release(this.upsample);
            this.march = marchId;
            this.upsample = `cloud_upsample:${variant}`;
            // A reconstrução lê a profundidade da cena (a superfície de cada texel), como a marcha e o aumento.
            this.prepareReconstruct(c, reconstructId, multisampled, weather);
            c.prepare({
                id: this.march,
                role: 'compute',
                shader: multisampled ? cloudMarchKernel.multisampled : cloudMarchKernel.single,
                entryPoints: ['cloud_march_main'],
            });
            c.prepare({
                id: this.upsample,
                role: 'compute',
                shader: multisampled
                    ? cloudUpsampleKernel.multisampled
                    : cloudUpsampleKernel.single,
                entryPoints: ['cloud_upsample_main'],
            });
        }
    }
}
