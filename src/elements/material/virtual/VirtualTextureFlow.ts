import { WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { Frame } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { Flow } from '../../../scene/flows/Flow';
import { FlowWork } from '../../../scene/flows/FlowWork';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
    type WorkSlot,
} from '../../../scene/flows/slots';
import { wordBuffer } from '../../gpu/compute/schemas';
import { VT_MAX_LEVELS, VT_PAGE_STRIDE } from './reference/virtualTexture';
import { VirtualTextureFrameSchema, vtPages } from './shaders';
import { VirtualTextures } from './VirtualTextures';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Slots do estágio das texturas virtuais. */
export interface VirtualTextureSlots extends SlotMap {
    /** As `VirtualTextures` da cena. */
    readonly cache: SingletonSlot<false>;
    /** A série dos pedidos (a fatia de agora zerada aqui e escrita pelo desenho; a anterior lida). */
    readonly requests: ChannelSlot<false>;
    /** A série por páginas do atlas (os carimbos e a época). */
    readonly atlas: ChannelSlot<false>;
    /** O espaço de trabalho (spec 039). */
    readonly work: WorkSlot<VirtualTextureWork>;
}

const FRAME = 'vt_frame';
const SCRATCH = 'vt_scratch';
const LOADS = 'vt_loads';
const COMMITS = 'vt_commits';
const UPLOAD = 'vt_upload';
/** Bytes de uma página no buffer de carga (128² RGBA8; linhas de 512 bytes, múltiplo de 256). */
const PAGE_BYTES = VT_PAGE_STRIDE * VT_PAGE_STRIDE * 4;
/** Quadros sem carga até a leitura dos pedidos ficar espaçada (a cena parada não lê de volta a cada quadro). */
const IDLE_FRAMES = 8;
/** Leituras em voo no máximo. */
const READS_IN_FLIGHT = 4;

/** Capacidades do trabalho: as do cache da cena. */
interface Capacity {
    atlasPages: number;
    budget: number;
    totalPages: number;
}

/**
 * Resource de trabalho do `VirtualTextureFlow`: os parâmetros do quadro, o espaço de trabalho das páginas, a lista das
 * alocações que a CPU lê de volta (`vt_loads`: a contagem, as contagens do quadro e os pares), a lista das cargas que a
 * CPU fez (`vt_commits`) e o buffer de carga dos texels (uma página por posição do orçamento).
 */
class VirtualTextureWork extends FlowWork {
    static readonly schema = new StructSchema('VirtualTextureWork', {});
    capacity: Capacity = { atlasPages: 4, budget: 1, totalPages: 1 };

    constructor() {
        super();
        this.use({
            descriptors: (): readonly GPUDescriptor[] => {
                const c = this.capacity;
                const physical = c.atlasPages * c.atlasPages;
                return [
                    {
                        id: FRAME,
                        role: 'uniform',
                        schema: VirtualTextureFrameSchema,
                        upload: 'never',
                    },
                    wordBuffer(
                        SCRATCH,
                        (32 + 3 * physical + c.totalPages + VT_MAX_LEVELS * c.budget) * 4,
                    ),
                    wordBuffer(LOADS, (4 + 2 * c.budget) * 4),
                    wordBuffer(COMMITS, 2 * c.budget * 4),
                    wordBuffer(UPLOAD, c.budget * PAGE_BYTES),
                ];
            },
        });
    }
}

/** As etapas das páginas (ver `vt_pages.wgsl`). */
const STEPS = [
    'vt_commit_main',
    'vt_clear_main',
    'vt_update_main',
    'vt_rank_main',
    'vt_free_main',
    'vt_allocate_main',
    'vt_requests_clear_main',
] as const;

type Ctx = TransitionContext<VirtualTextureSlots>;

/**
 * VirtualTextureFlow — as páginas das texturas virtuais (spec 034, T060c; o laço de realimentação das texturas
 * virtuais do Unreal e do id Tech): no quadro, as páginas que a CPU carregou desde o anterior entram no atlas (a cópia
 * do buffer de carga e o carimbo da série por páginas); os pedidos do quadro anterior (a série) envelhecem e renovam a
 * tabela, e as páginas pedidas sem página física são alocadas na GPU — do nível mais grosso ao mais fino, as livres e
 * depois as não pedidas há mais tempo, até o orçamento —; a fatia de agora dos pedidos é zerada para o desenho. A lista
 * das alocações volta à CPU pela leitura da C2 (`ResourceDirectory.read`); quando chega, os texels de cada página (da
 * pirâmide da `VirtualImage`) vão ao buffer de carga e entram no atlas no quadro seguinte. A leitura é a cada quadro
 * enquanto há o que carregar e espaçada com a cena parada.
 */
export class VirtualTextureFlow extends Flow<VirtualTextureSlots, 'idle'> {
    readonly type = 'VirtualTextureFlow';
    readonly slots: VirtualTextureSlots;
    override readonly pipelines: readonly PipelineDescriptor[] = STEPS.map((entry) => ({
        id: entry,
        role: 'compute' as const,
        shader: vtPages,
        entryPoints: [entry],
    }));
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly work = new VirtualTextureWork();
    /** As listas de alocações lidas de volta, à espera da carga (pares página virtual, física), em ordem. */
    private readonly arrived: [number, number][] = [];
    /** As cargas deste quadro (pares) e as posições delas no buffer de carga. */
    private commits: [number, number][] = [];
    private readsInFlight = 0;
    /** Leituras seguidas sem nada a carregar, e a contagem dos quadros pulados depois delas. */
    private idle = 0;
    private skipped = 0;
    /** A CPU lê a lista deste quadro (a GPU só aloca então). */
    private reading = false;
    /** As palavras do cache a que as listas se referem (outra disposição: as listas antigas não valem). */
    private words: Uint32Array | undefined;
    private frameKey = '';
    private active = false;
    /** Contagens do último quadro lido (páginas pedidas, residentes, pendentes) e as cargas feitas. */
    stats = { requested: 0, resident: 0, pending: 0, loaded: 0 };

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        const work = this.work;
        this.slots = {
            cache: slot.singleton(VirtualTextures.schema),
            requests: slot.channel(VirtualTextures.schema, 'requests'),
            atlas: slot.channel(VirtualTextures.schema, 'atlas'),
            work: slot.work(() => work),
        };
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                poolReallocated: 'ignore',
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

    /** As cargas no atlas, as etapas das páginas e a leitura da lista das alocações. */
    dispatch(frame: Frame, bound: BoundFlow<VirtualTextureSlots>): void {
        if (!this.active) return;
        const steps = STEPS.map((id) => bound.compute(id));
        if (steps.some((s) => !s.ready)) return;
        const atlas = bound.slots.atlas.texture(0);
        const upload = this.resources.bufferOf(this.work, UPLOAD);
        const cache = bound.slots.cache.resource as VirtualTextures;
        if (atlas === undefined || upload === undefined) return;
        const side = cache.data.atlasPages;
        this.commits.forEach(([, phys], k) => {
            frame.copyBufferToTexture(
                upload,
                atlas,
                {
                    offset: k * PAGE_BYTES,
                    bytesPerRow: VT_PAGE_STRIDE * 4,
                    rowsPerImage: VT_PAGE_STRIDE,
                },
                [VT_PAGE_STRIDE, VT_PAGE_STRIDE, 1],
                {
                    origin: [
                        (phys % side) * VT_PAGE_STRIDE,
                        Math.floor(phys / side) * VT_PAGE_STRIDE,
                        0,
                    ],
                },
            );
        });
        const c = this.work.capacity;
        const physical = c.atlasPages * c.atlasPages;
        frame.compute('VirtualTextureFlow', (pass) => {
            const run = (index: number, invocations: number): void => {
                const step = steps[index]!;
                pass.bind.setPipeline(step.spec);
                step.bindTo(pass.bind);
                pass.dispatch.invocations(Math.max(1, invocations), WORKGROUP_SIZE);
            };
            // As filas, as livres e a alocação: um grupo de trabalho cada (a ordem pela soma de prefixos do grupo).
            const once = (index: number): void => {
                const step = steps[index]!;
                pass.bind.setPipeline(step.spec);
                step.bindTo(pass.bind);
                pass.dispatch.workgroups(1);
            };
            if (this.commits.length > 0) run(0, this.commits.length);
            // A tabela e a alocação só nos quadros em que a CPU lê a lista (com a cena parada, um em `IDLE_FRAMES`): a
            // idade das páginas conta essas renovações.
            if (this.reading) {
                run(1, Math.max(32, physical));
                run(2, c.totalPages);
                once(3);
                once(4);
                once(5);
            }
            run(6, c.totalPages);
        });
        bound.slots.requests.written();
        bound.slots.atlas.written();
        this.commits = [];
        if (this.reading) this.readLoads();
    }

    /** O cache, as capacidades, os parâmetros do quadro e as cargas que chegaram. */
    private prepare(c: Ctx): void {
        const cache = c.bound.slots.cache.resource as VirtualTextures;
        const { atlasPages, budget, totalPages, words } = cache.data;
        this.active = totalPages > 0;
        if (!this.active) return;
        if (words !== this.words) {
            // Outra disposição (imagem acrescentada): as listas em voo e as que chegaram não valem.
            this.words = words;
            this.arrived.length = 0;
        }
        this.ensureCapacity(atlasPages, budget, totalPages);
        this.load(cache, budget);
        const requestsValid = c.bound.slots.requests.age(1) === 1 ? 1 : 0;
        this.reading = this.readsInFlight < READS_IN_FLIGHT && this.skip();
        const allocate = this.reading ? 1 : 0;
        const key = `${requestsValid}:${this.commits.length}:${allocate}`;
        if (key !== this.frameKey) {
            this.resources.writeNow(
                this.work,
                FRAME,
                VirtualTextureFrameSchema.pack({
                    requestsValid,
                    commits: this.commits.length,
                    allocate,
                }),
            );
            this.frameKey = key;
        }
    }

    /** Capacidades do trabalho; mudadas, a C2 realoca. */
    private ensureCapacity(atlasPages: number, budget: number, totalPages: number): void {
        const c = this.work.capacity;
        if (c.atlasPages === atlasPages && c.budget === budget && c.totalPages === totalPages)
            return;
        this.work.capacity = { atlasPages, budget, totalPages };
        this.work.refresh();
        this.frameKey = '';
    }

    /** Os texels das páginas que chegaram (até o orçamento) no buffer de carga e a lista das cargas do quadro. */
    private load(cache: VirtualTextures, budget: number): void {
        if (this.arrived.length === 0) return;
        const taken = this.arrived.splice(0, budget);
        const images = cache.images;
        const firsts: number[] = [];
        let first = 0;
        for (const img of images) {
            firsts.push(first);
            first += img.pages;
        }
        const texels = new Uint8Array(PAGE_BYTES);
        const commits = new Uint32Array(2 * taken.length);
        taken.forEach(([g, phys], k) => {
            let i = images.length - 1;
            while (i > 0 && firsts[i]! > g) i--;
            images[i]!.pageTexels(g - firsts[i]!, texels);
            this.resources.writeNow(this.work, UPLOAD, texels, k * PAGE_BYTES);
            commits[2 * k] = g;
            commits[2 * k + 1] = phys;
        });
        this.resources.writeNow(this.work, COMMITS, commits);
        this.commits = taken;
        this.stats.loaded += taken.length;
    }

    /** Lê de volta neste quadro? A cada quadro enquanto há o que carregar; parada, um quadro em `IDLE_FRAMES`. */
    private skip(): boolean {
        if (this.idle < IDLE_FRAMES) return true;
        this.skipped = (this.skipped + 1) % IDLE_FRAMES;
        return this.skipped === 0;
    }

    /** Lê de volta a lista das alocações do quadro e as contagens. */
    private readLoads(): void {
        const words = this.words;
        this.readsInFlight++;
        void this.resources.read(this.work, LOADS).then((record) => {
            this.readsInFlight--;
            const list = record?.w as ArrayLike<number> | undefined;
            if (list === undefined || words !== this.words) return;
            const count = list[0] ?? 0;
            this.stats.requested = list[1] ?? 0;
            this.stats.resident = list[2] ?? 0;
            this.stats.pending = list[3] ?? 0;
            for (let d = 0; d < count; d++) this.arrived.push([list[4 + 2 * d]!, list[5 + 2 * d]!]);
            this.idle = count > 0 ? 0 : this.idle + 1;
        });
    }

    /** O trabalho é do `VirtualTextureWork` (a C2 o libera com ele). */
    override dispose(): void {
        this.arrived.length = 0;
        this.commits = [];
    }
}
