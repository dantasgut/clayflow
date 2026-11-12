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
import type { EventBus, Unsubscribe } from '../../../scene/events/EventBus';
import type { VirtualTextureDeliveryPayload } from '../../../scene/events/EventMap';
import { wordBuffer } from '../../gpu/compute/schemas';
import {
    VT_MAX_LEVELS,
    VT_PAGE_BORDER,
    VT_PAGE_PAYLOAD,
    VT_PAGE_STRIDE,
    VT_PREP_BLOCK,
    VT_PREP_LEVELS,
    vtPrepOffset,
    vtSizeOfLevel,
} from './layout';
import { VirtualPrepareSchema, VirtualTextureFrameSchema, vtPages, vtPrepare } from './shaders';
import type { VirtualImage } from './VirtualImage';
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
const PREP = 'vt_prep';
const PREP_IN = 'vt_prep_in';
const PREP_OUT = 'vt_prep_out';
/** Palavras da saída de um bloco da preparação (os níveis 1 a `VT_PREP_LEVELS` do bloco). */
const PREP_OUT_WORDS = vtPrepOffset(VT_PREP_LEVELS + 1);
/** Bytes de uma página no buffer de carga (128² RGBA8; linhas de 512 bytes, múltiplo de 256). */
const PAGE_BYTES = VT_PAGE_STRIDE * VT_PAGE_STRIDE * 4;
/** Quadros sem carga até a leitura dos pedidos ficar espaçada (a cena parada não lê de volta a cada quadro). */
const IDLE_FRAMES = 8;
/** Leituras em voo no máximo. */
const READS_IN_FLIGHT = 4;

/** Capacidades do trabalho: as do cache da cena e a preparação em curso (o bloco de entrada e a saída na GPU). */
interface Capacity {
    atlasPages: number;
    budget: number;
    totalPages: number;
    preparing: boolean;
}

/**
 * Resource de trabalho do `VirtualTextureFlow`: os parâmetros do quadro, o espaço de trabalho das páginas, a lista das
 * alocações que a CPU lê de volta (`vt_loads`: a contagem, as contagens do quadro e os pares), a lista das cargas
 * (`vt_commits`), o buffer de carga dos texels (uma página por posição do orçamento) e, enquanto alguma imagem é
 * preparada, o bloco de entrada e a saída dos níveis reduzidos (`vt_prep_in`, `vt_prep_out`, ver `vt_prepare.wgsl`).
 */
class VirtualTextureWork extends FlowWork {
    static readonly schema = new StructSchema('VirtualTextureWork', {});
    capacity: Capacity = { atlasPages: 4, budget: 1, totalPages: 1, preparing: false };

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
                    {
                        id: PREP,
                        role: 'uniform',
                        schema: VirtualPrepareSchema,
                        upload: 'never',
                    },
                    wordBuffer(PREP_IN, c.preparing ? VT_PREP_BLOCK * VT_PREP_BLOCK * 4 : 16),
                    wordBuffer(PREP_OUT, c.preparing ? PREP_OUT_WORDS * 4 : 16),
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

/** Os kernels da preparação (ver `vt_prepare.wgsl`). */
const PREP_STEPS = ['vt_reduce_tiles_main', 'vt_reduce_rest_main'] as const;

type Ctx = TransitionContext<VirtualTextureSlots>;

/** Um pedido à fonte em aberto: um bloco da preparação ou uma página alocada. */
type Pending =
    | { readonly kind: 'block'; readonly job: Preparation; readonly block: number }
    | { readonly kind: 'page'; readonly page: number; readonly phys: number };

/**
 * A preparação de uma imagem: as rodadas (o nível de entrada L e os níveis produzidos a partir dele, até
 * `VT_PREP_LEVELS`) e, em cada uma, os blocos de 1024² do nível L, um por despacho.
 */
interface Preparation {
    readonly image: VirtualImage;
    readonly index: number;
    level: number;
    count: number;
    blocks: [number, number][];
    next: number;
    /** O bloco pedido à fonte (o pedido) e os texels dele, à espera do despacho. */
    request: number | undefined;
    input: Uint8Array | undefined;
    /** O bloco despachado cuja saída está em leitura. */
    reading: number | undefined;
}

/**
 * VirtualTextureFlow — as páginas das texturas virtuais (spec 034, T060c; o laço de realimentação das texturas
 * virtuais do Unreal e do id Tech): no quadro, as páginas que a CPU carregou desde o anterior entram no atlas (a cópia
 * do buffer de carga e o carimbo da série por páginas); os pedidos do quadro anterior (a série) envelhecem e renovam a
 * tabela, e as páginas pedidas sem página física são alocadas na GPU — do nível mais grosso ao mais fino, as livres e
 * depois as não pedidas há mais tempo, até o orçamento —; a fatia de agora dos pedidos é zerada para o desenho. A lista
 * das alocações volta à CPU pela leitura da C2 (`ResourceDirectory.read`); quando chega, cada página é pedida à fonte
 * da imagem (`virtualTextureRequest`: o retângulo de 128² com a borda, no nível) e a resposta (`virtualTextureDelivery`,
 * só a cópia dos bytes) vai ao buffer de carga e entra no atlas no quadro seguinte. A leitura é a cada quadro enquanto há
 * o que carregar e espaçada com a cena parada.
 *
 * Preparação: na entrada de uma imagem, a pirâmide é feita na GPU — os blocos de até 1024² do nível L são pedidos à
 * fonte, um por despacho, e reduzidos aos níveis L + 1 a L + 10 (`vt_prepare.wgsl`); cada nível reduzido volta à fonte
 * para ela guardar (`virtualTextureLevel`), e a rodada seguinte parte do último. Com a pirâmide inteira na fonte, a média
 * (o nível de 1 × 1) e a marca de preparada vão ao cabeçalho da imagem e as páginas dela passam a ser pedidas. O motor
 * não guarda a original nem processa texels fora da GPU.
 */
export class VirtualTextureFlow extends Flow<VirtualTextureSlots, 'idle'> {
    readonly type = 'VirtualTextureFlow';
    readonly slots: VirtualTextureSlots;
    override readonly pipelines: readonly PipelineDescriptor[] = [
        ...STEPS.map((entry) => ({
            id: entry,
            role: 'compute' as const,
            shader: vtPages,
            entryPoints: [entry],
        })),
        ...PREP_STEPS.map((entry) => ({
            id: entry,
            role: 'compute' as const,
            shader: vtPrepare,
            entryPoints: [entry],
        })),
    ];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly events: EventBus;
    private readonly stopListening: Unsubscribe;
    private readonly work = new VirtualTextureWork();
    /** As alocações lidas de volta, à espera do pedido à fonte (pares página virtual, física), em ordem. */
    private readonly arrived: [number, number][] = [];
    /** Os pedidos à fonte em aberto e as respostas que chegaram, à espera do quadro. */
    private readonly pending = new Map<number, Pending>();
    private readonly delivered: VirtualTextureDeliveryPayload[] = [];
    /** As páginas respondidas, à espera da carga (pares e texels), em ordem. */
    private readonly ready: { page: number; phys: number; texels: Uint8Array }[] = [];
    private nextRequest = 1;
    /** A preparação em curso e o bloco a despachar neste quadro. */
    private preparation: Preparation | undefined;
    private prepDispatch: Preparation | undefined;
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
    private cache: VirtualTextures | undefined;
    /** Contagens do último quadro lido (páginas pedidas, residentes, pendentes) e as cargas feitas. */
    stats = { requested: 0, resident: 0, pending: 0, loaded: 0, prepared: 0, blocks: 0 };

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.events = ctx.events;
        this.stopListening = ctx.events.on('virtualTextureDelivery', (e) => {
            this.delivered.push(e);
        });
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
                        this.frame(c);
                    },
                },
            },
        };
    }

    /** As cargas no atlas, as etapas das páginas e a leitura da lista das alocações. */
    dispatch(frame: Frame, bound: BoundFlow<VirtualTextureSlots>): void {
        if (!this.active) return;
        const steps = STEPS.map((id) => bound.compute(id));
        const prep = PREP_STEPS.map((id) => bound.compute(id));
        if (steps.some((s) => !s.ready) || prep.some((s) => !s.ready)) return;
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
            // A preparação: um bloco por quadro — os ladrilhos de 32² até o nível L + 5 e o resto até o L + 10.
            const job = this.prepDispatch;
            if (job !== undefined) {
                const [bw, bh] = this.blockSize(job, job.next);
                pass.bind.setPipeline(prep[0]!.spec);
                prep[0]!.bindTo(pass.bind);
                pass.dispatch.invocations(Math.ceil(bw / 32) * Math.ceil(bh / 32) * 256, 256);
                if (job.count > 5) {
                    pass.bind.setPipeline(prep[1]!.spec);
                    prep[1]!.bindTo(pass.bind);
                    pass.dispatch.workgroups(1);
                }
            }
        });
        bound.slots.requests.written();
        bound.slots.atlas.written();
        this.commits = [];
        if (this.reading) this.readLoads();
        if (this.prepDispatch !== undefined) this.readBlock(this.prepDispatch);
        this.prepDispatch = undefined;
    }

    /** O cache, as capacidades, a preparação, os pedidos à fonte, os parâmetros do quadro e as cargas que chegaram. */
    private frame(c: Ctx): void {
        const cache = c.bound.slots.cache.resource as VirtualTextures;
        this.cache = cache;
        const { atlasPages, budget, totalPages, words } = cache.data;
        this.active = totalPages > 0;
        if (!this.active) return;
        if (words !== this.words) {
            // Outra disposição (imagem acrescentada): as listas em voo, as que chegaram e os pedidos de páginas não
            // valem (o cabeçalho novo já traz a média e a marca das imagens preparadas).
            this.words = words;
            this.arrived.length = 0;
            this.ready.length = 0;
            for (const [id, p] of this.pending) if (p.kind === 'page') this.pending.delete(id);
        }
        // Um bloco que não chegou a ser despachado (os kernels ainda não prontos) é pedido de novo.
        this.prepDispatch = undefined;
        this.receive(cache);
        this.prepare(cache);
        this.ensureCapacity(atlasPages, budget, totalPages, this.preparation !== undefined);
        this.request(cache);
        this.load(budget);
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
    private ensureCapacity(
        atlasPages: number,
        budget: number,
        totalPages: number,
        preparing: boolean,
    ): void {
        const c = this.work.capacity;
        if (
            c.atlasPages === atlasPages
            && c.budget === budget
            && c.totalPages === totalPages
            && c.preparing === preparing
        )
            return;
        this.work.capacity = { atlasPages, budget, totalPages, preparing };
        this.work.refresh();
        this.frameKey = '';
    }

    /** As respostas da fonte que chegaram: os blocos da preparação e as páginas (as de pedidos que não valem saem). */
    private receive(cache: VirtualTextures): void {
        for (const e of this.delivered.splice(0)) {
            if (e.textures !== cache) continue;
            const p = this.pending.get(e.request);
            if (p === undefined) continue;
            this.pending.delete(e.request);
            if (p.kind === 'page') {
                if (e.texels.length === PAGE_BYTES)
                    this.ready.push({ page: p.page, phys: p.phys, texels: e.texels });
            } else if (p.job === this.preparation && p.job.request === e.request) {
                p.job.request = undefined;
                const [bw, bh] = this.blockSize(p.job, p.block);
                if (e.texels.length === bw * bh * 4) p.job.input = e.texels;
            }
        }
    }

    /**
     * A preparação: a próxima imagem sem pirâmide, o pedido do bloco seguinte à fonte e, com os texels dele, os
     * parâmetros e o bloco de entrada para o despacho deste quadro (um bloco por vez: o seguinte espera a leitura).
     */
    private prepare(cache: VirtualTextures): void {
        if (this.preparation === undefined) {
            const index = cache.images.findIndex((img) => cache.averageOf(img) === undefined);
            if (index < 0) return;
            const image = cache.images[index]!;
            this.preparation = {
                image,
                index,
                level: 0,
                count: 0,
                blocks: [],
                next: 0,
                request: undefined,
                input: undefined,
                reading: undefined,
            };
            this.round(this.preparation, 0);
        }
        const job = this.preparation;
        if (
            job.reading !== undefined
            || !this.allocated(PREP_IN, VT_PREP_BLOCK * VT_PREP_BLOCK * 4)
        )
            return;
        if (job.input === undefined) {
            if (job.request === undefined) {
                const [x, y] = job.blocks[job.next]!;
                const [w, h] = this.blockSize(job, job.next);
                job.request = this.ask(
                    cache,
                    { kind: 'block', job, block: job.next },
                    job,
                    job.level,
                    x,
                    y,
                    w,
                    h,
                );
            }
            return;
        }
        if (job.count === 0) {
            // Imagem de 1 × 1: o nível 0 já é a média.
            this.finish(cache, job, new Uint32Array(job.input.buffer, job.input.byteOffset, 1)[0]!);
            return;
        }
        const [x, y] = job.blocks[job.next]!;
        const [bw, bh] = this.blockSize(job, job.next);
        const [lw, lh] = vtSizeOfLevel(job.image.width, job.image.height, job.level);
        this.resources.writeNow(this.work, PREP_IN, job.input);
        this.resources.writeNow(
            this.work,
            PREP,
            VirtualPrepareSchema.pack({
                size: [lw, lh, bw, bh],
                origin: [x, y, job.count, job.image.colorSpace === 'linear' ? 1 : 0],
            }),
        );
        job.input = undefined;
        this.prepDispatch = job;
        this.stats.blocks++;
    }

    /** A rodada que parte do nível `level`: os níveis produzidos e os blocos de 1024² dele. */
    private round(job: Preparation, level: number): void {
        const { width, height, levels } = job.image;
        const [lw, lh] = vtSizeOfLevel(width, height, level);
        job.level = level;
        job.count = Math.min(VT_PREP_LEVELS, levels - 1 - level);
        job.blocks = [];
        for (let y = 0; y < lh; y += VT_PREP_BLOCK)
            for (let x = 0; x < lw; x += VT_PREP_BLOCK) job.blocks.push([x, y]);
        job.next = 0;
    }

    /** Largura e altura do bloco `block` da rodada no nível de entrada. */
    private blockSize(job: Preparation, block: number): [number, number] {
        const [lw, lh] = vtSizeOfLevel(job.image.width, job.image.height, job.level);
        const [x, y] = job.blocks[block]!;
        return [Math.min(VT_PREP_BLOCK, lw - x), Math.min(VT_PREP_BLOCK, lh - y)];
    }

    /** Lê de volta a saída do bloco despachado; os níveis vão à fonte e a preparação segue. */
    private readBlock(job: Preparation): void {
        job.reading = job.next;
        void this.resources.read(this.work, PREP_OUT).then((record) => {
            const out = record?.w as Uint32Array | undefined;
            if (job !== this.preparation) return;
            job.reading = undefined;
            const cache = this.cacheOf(job);
            if (out === undefined || cache === undefined) return;
            const [ox, oy] = job.blocks[job.next]!;
            const { width, height } = job.image;
            let last = 0;
            for (let k = 1; k <= job.count; k++) {
                const level = job.level + k;
                const [lw, lh] = vtSizeOfLevel(width, height, level);
                const x0 = ox >> k;
                const y0 = oy >> k;
                const side = VT_PREP_BLOCK >> k;
                const w = Math.min((ox + VT_PREP_BLOCK) >> k, lw) - x0;
                const h = Math.min((oy + VT_PREP_BLOCK) >> k, lh) - y0;
                if (w <= 0 || h <= 0) continue;
                // A cópia das linhas válidas do bloco no nível (a saída tem o lado do bloco).
                const texels = new Uint8Array(w * h * 4);
                const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
                const offset = vtPrepOffset(k) * 4;
                for (let j = 0; j < h; j++)
                    texels.set(
                        bytes.subarray(offset + j * side * 4, offset + (j * side + w) * 4),
                        j * w * 4,
                    );
                this.events.emit('virtualTextureLevel', {
                    textures: cache,
                    image: job.index,
                    level,
                    x: x0,
                    y: y0,
                    width: w,
                    height: h,
                    texels,
                });
                if (level === job.image.levels - 1) last = out[vtPrepOffset(k)]!;
            }
            job.next++;
            if (job.next < job.blocks.length) return;
            if (job.level + job.count >= job.image.levels - 1) this.finish(cache, job, last);
            else this.round(job, job.level + job.count);
        });
    }

    /**
     * A pirâmide inteira está com a fonte: a média (o resultado da GPU, só posto no lugar) e a marca de preparada no
     * cabeçalho da imagem — no dado das `VirtualTextures` (as disposições seguintes o levam) e no buffer da GPU.
     */
    private finish(cache: VirtualTextures, job: Preparation, average: number): void {
        const at = cache.setPrepared(job.index, average >>> 0);
        if (this.resources.bufferOf(cache, 'words') !== undefined)
            for (const [word, value] of at)
                this.resources.writeNow(cache, 'words', new Uint32Array([value]), word * 4);
        this.preparation = undefined;
        this.stats.prepared++;
    }

    /** O buffer `id` do trabalho está alocado com ao menos `bytes`? */
    private allocated(id: string, bytes: number): boolean {
        const buffer = this.resources.bufferOf(this.work, id) as { byteSize?: number } | undefined;
        return (buffer?.byteSize ?? 0) >= bytes;
    }

    /** As `VirtualTextures` da preparação (as da cena, enquanto a imagem está nelas). */
    private cacheOf(job: Preparation): VirtualTextures | undefined {
        return this.cache?.images[job.index] === job.image ? this.cache : undefined;
    }

    /** Pede à fonte um retângulo de um nível; devolve o pedido. */
    private ask(
        cache: VirtualTextures,
        pending: Pending,
        job: { readonly index: number; readonly image: VirtualImage },
        level: number,
        x: number,
        y: number,
        width: number,
        height: number,
    ): number {
        const request = this.nextRequest++;
        this.pending.set(request, pending);
        this.events.emit('virtualTextureRequest', {
            textures: cache,
            request,
            image: job.index,
            level,
            x,
            y,
            width,
            height,
            wrap: job.image.wrap,
        });
        return request;
    }

    /** As páginas alocadas (das imagens preparadas) pedidas à fonte: o retângulo de 128² com a borda, no nível. */
    private request(cache: VirtualTextures): void {
        if (this.arrived.length === 0) return;
        const images = cache.images;
        const firsts: number[] = [];
        let first = 0;
        for (const img of images) {
            firsts.push(first);
            first += img.pages;
        }
        for (const [g, phys] of this.arrived.splice(0)) {
            let i = images.length - 1;
            while (i > 0 && firsts[i]! > g) i--;
            const image = images[i]!;
            if (cache.averageOf(image) === undefined) continue;
            const { level, px, py } = image.locate(g - firsts[i]!);
            this.ask(
                cache,
                { kind: 'page', page: g, phys },
                { index: i, image },
                level,
                px * VT_PAGE_PAYLOAD - VT_PAGE_BORDER,
                py * VT_PAGE_PAYLOAD - VT_PAGE_BORDER,
                VT_PAGE_STRIDE,
                VT_PAGE_STRIDE,
            );
        }
    }

    /** As páginas respondidas (até o orçamento) no buffer de carga e a lista das cargas do quadro. */
    private load(budget: number): void {
        if (this.ready.length === 0) return;
        const taken = this.ready.splice(0, budget);
        const commits = new Uint32Array(2 * taken.length);
        taken.forEach(({ page, phys, texels }, k) => {
            this.resources.writeNow(this.work, UPLOAD, texels, k * PAGE_BYTES);
            commits[2 * k] = page;
            commits[2 * k + 1] = phys;
        });
        this.resources.writeNow(this.work, COMMITS, commits);
        this.commits = taken.map(({ page, phys }) => [page, phys]);
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
        this.stopListening();
        this.arrived.length = 0;
        this.commits = [];
        this.pending.clear();
        this.delivered.length = 0;
        this.ready.length = 0;
        this.preparation = undefined;
    }
}
