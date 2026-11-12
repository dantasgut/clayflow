import { NONE, WORKGROUP_SIZE as ENGINE_WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type {
    AnyBufferSpec,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    TextureViewSpec,
} from '../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { BindingSource } from '../../scene/flows/FlowBinding';
import type { WorkContext, WorkPart } from '../../scene/flows/FlowWork';
import type { BoundChannel } from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { PerStepUniforms } from '../../elements/gpu/compute/PerStepUniforms';
import { wordBuffer } from '../../elements/gpu/compute/schemas';
import { vertexBoundsResource } from '../../elements/gpu/shaders/vertexBounds';
import {
    HZB_HEIGHT,
    HZB_WIDTH,
    hzbLevelSize,
    hzbLevels,
    hzbWords,
} from '../../elements/render/reference/drawCull';
import { DrawCullParamsSchema, DrawCullStepSchema } from './renderSchemas';
import { drawCull, drawCullBounds, drawCullHzb, drawCullResources } from './shaders';

const WORKGROUP_SIZE = ENGINE_WORKGROUP_SIZE.value;

/** Ids do trabalho. */
const PARAMS = 'forward_cull_params';
const GROUPS = 'forward_cull_groups';
const TEMPLATE = 'forward_cull_template';
const SLOT_GROUP = 'forward_cull_slot_group';
const BOUNDS = 'forward_cull_bounds';
const FLAGS_A = 'forward_cull_flags_a';
const FLAGS_B = 'forward_cull_flags_b';
const SCAN = 'forward_cull_scan';
const VISIBLE = 'forward_cull_visible';
const ARGS = 'forward_cull_args';
/** A série da hierarquia de profundidade (o slot `hzb` do `ForwardFlow`). */
export const DRAW_CULL_HZB = 'forward_cull_hzb';

/** Palavras de um grupo na tabela, de um registro de argumentos e registros por grupo (ver `draw_cull.wgsl`). */
const GROUP_WORDS = 4;
const ARGS_WORDS = 5;
export const DRAW_CULL_RECORDS = 3;
/** Posição da lista sem grupo (a lista da C2 tem buracos entre os grupos): o `NONE` do motor. */
const SKIP = NONE.value;
const NO_CULL = 1;
const NON_INDEXED = 4;
/** Bits dos parâmetros: o descarte ligado; a hierarquia do quadro anterior vale. */
const ENABLED = 1;
const OCCLUSION = 2;
/** Elementos por grupo e níveis no máximo da soma de prefixos (256³ posições). */
const SCAN_GROUP = 256;
const SCAN_LEVELS = 3;

/** Elementos de cada nível da soma de prefixos de `n` elementos: até um nível com ≤ 256 (o topo). */
function scanLevelCounts(n: number): number[] {
    const counts = [Math.max(1, n)];
    while (counts[counts.length - 1]! > SCAN_GROUP)
        counts.push(Math.ceil(counts[counts.length - 1]! / SCAN_GROUP));
    return counts;
}

/** Os registros de argumentos de um grupo: a lista 1, a lista 2 (depois da 1) e as duas juntas. */
export type CullRecord = 0 | 1 | 2;

/** Um grupo do desenho para o descarte (na ordem dos grupos do slot). */
export interface CullGroup {
    readonly key: string;
    readonly first: number;
    readonly count: number;
    /** Os vértices da geometria (a caixa), ou `undefined` sem buffer ainda. */
    readonly vertices: AnyBufferSpec | undefined;
    /** Descartável: triângulos com caixa (sprites e arame desenham sempre). */
    readonly cull: boolean;
    /** Os vértices são reescritos pela GPU: a caixa é refeita a cada quadro. */
    readonly deforming: boolean;
    /** Desenho indexado (índices) ou por vértices. */
    readonly indexed: boolean;
    /** Índices ou vértices de uma instância. */
    readonly drawCount: number;
    /** Contagem produzida na GPU (malha adaptativa): o registro da geometria e o byte da palavra. */
    readonly source?: { readonly buffer: AnyBufferSpec; readonly offset: number };
}

/** O que o quadro pede ao descarte. */
export interface CullFrame {
    /** Slot da câmera ativa no pool das matrizes. */
    readonly cameraSlot: number;
    /** O descarte vale (a projeção da câmera é a `viewProjection`: sem função de projeção). */
    readonly enabled: boolean;
    /** A profundidade da cena (o nível 0 da hierarquia) e se tem amostras. */
    readonly depth: TextureViewSpec | undefined;
    readonly multisampled: boolean;
}

/** Capacidades do trabalho (crescem por dobra). */
interface Capacity {
    groups: number;
    slots: number;
}

/**
 * O desenho principal conduzido pela GPU (spec 034, T060d) — parte do trabalho do `ForwardFlow`: a caixa de cada geometria
 * (um despacho por geometria; a deformada pela GPU, a cada quadro), o descarte de cada instância pelo tronco da vista e
 * pela oclusão em duas fases (a hierarquia de profundidade do quadro anterior, pela série, e a deste quadro, montada da
 * profundidade da fase 1), as listas densas por grupo na ordem da lista de instâncias (soma de prefixos: a imagem não
 * depende da ordem dos atômicos) e os argumentos dos desenhos indiretos — a lista 1, a lista 2 e as duas juntas (a cor, o
 * movimento e os transmissivos). O desenho lê `draw_visible[instance_index]`.
 *
 * Sem `indirect-first-instance` (o `firstInstance` dos argumentos indiretos), a lista é a cópia da de instâncias nas
 * mesmas posições e o desenho é direto, como antes. A CPU escreve as tabelas só quando os grupos mudam e os parâmetros só
 * quando mudam; não acompanha a visibilidade.
 */
export class DrawCulling implements WorkPart {
    private capacity: Capacity = { groups: 1, slots: 1 };
    private readonly steps: PerStepUniforms;
    /** As posições escritas nas regiões da soma de prefixos. */
    private stepsKey = '';
    /** Pipelines fixos (entrada → id), preparados uma vez; a chave dos buffers ligados a eles. */
    private readonly kernels = new Map<string, string>();
    private sourcesBound = '';
    /** Pipeline do nível 0 da hierarquia (pela profundidade com ou sem amostras) e a vista ligada. */
    private hzbKernel: string | undefined;
    private hzbDepth: TextureViewSpec | undefined;
    /** Pipeline da caixa por buffer de vértices (ligado a ele) e os grupos a refazer no quadro. */
    private readonly boundsKernels = new Map<AnyBufferSpec, string>();
    private boundsSerial = 0;
    private boundsRun: { readonly group: number; readonly kernel: string }[] = [];
    private readonly boundsStale = new Set<number>();
    /** A posição de cada grupo pela chave, os grupos escritos e os parâmetros escritos. */
    private readonly groupIndex = new Map<string, number>();
    private groupsKey = '';
    private paramsKey = '';
    private groups: readonly CullGroup[] = [];
    private slotCount = 0;
    private sources: {
        readonly group: number;
        readonly buffer: AnyBufferSpec;
        readonly offset: number;
    }[] = [];
    /** O quadro: há o que desenhar, o descarte vale, a hierarquia do quadro anterior vale. */
    private active = false;
    private enabledNow = false;
    private occlusionNow = false;
    /** O device tem `indirect-first-instance`. */
    readonly indirect: boolean;
    private readonly ids = new WeakMap<object, number>();
    private nextId = 1;

    constructor(private readonly ctx: WorkContext) {
        this.indirect = ctx.core.capabilities().features.includes('indirect-first-instance');
        this.steps = new PerStepUniforms(ctx, {
            id: 'forward_cull_step',
            schema: DrawCullStepSchema,
        });
        ctx.work.use(this);
    }

    descriptors(): readonly GPUDescriptor[] {
        const c = this.capacity;
        return [
            { id: PARAMS, role: 'uniform', schema: DrawCullParamsSchema, upload: 'never' },
            wordBuffer(GROUPS, c.groups * GROUP_WORDS * 4),
            wordBuffer(TEMPLATE, c.groups * ARGS_WORDS * 4),
            wordBuffer(SLOT_GROUP, c.slots * 4),
            wordBuffer(BOUNDS, c.groups * 32),
            wordBuffer(FLAGS_A, c.slots * 4),
            wordBuffer(FLAGS_B, c.slots * 4),
            wordBuffer(
                SCAN,
                scanLevelCounts(c.slots)
                    .slice(1)
                    .reduce((a, n) => a + n, 0)
                    * 4
                    + 4,
            ),
            wordBuffer(VISIBLE, c.slots * 4),
            wordBuffer(ARGS, c.groups * DRAW_CULL_RECORDS * ARGS_WORDS * 4, 'indirect'),
            // A hierarquia de profundidade (spec 037): a deste quadro e a do anterior.
            { ...wordBuffer(DRAW_CULL_HZB, hzbWords() * 4), history: { depth: 2 } },
        ];
    }

    /** O descarte vale neste quadro: as duas fases, os desenhos indiretos. */
    get twoPhase(): boolean {
        return this.active && this.indirect && this.enabledNow;
    }

    /** Pronto para gravar (os kernels compilados e os buffers alocados). */
    get ready(): boolean {
        if (!this.active) return false;
        for (const id of this.kernels.values())
            if (this.ctx.work.pipelines.compute(id) === undefined) return false;
        for (const b of this.boundsRun)
            if (this.ctx.work.pipelines.compute(b.kernel) === undefined) return false;
        return !this.twoPhase || this.ctx.work.pipelines.compute(this.hzbKernel!) !== undefined;
    }

    /** A lista das instâncias desenhadas (o `draw_visible` do desenho). */
    get visible(): StorageBufferSpec | undefined {
        return this.buffer(VISIBLE) as StorageBufferSpec | undefined;
    }

    /** Os argumentos dos desenhos indiretos. */
    get args(): IndirectBufferSpec | undefined {
        const b = this.buffer(ARGS);
        return b?.subkind === 'indirect' ? b : undefined;
    }

    /** O byte do registro `record` do grupo `key` nos argumentos (ou `undefined` para grupo desconhecido). */
    argsOffset(key: string, record: CullRecord): number | undefined {
        const g = this.groupIndex.get(key);
        return g === undefined ? undefined : (g * DRAW_CULL_RECORDS + record) * ARGS_WORDS * 4;
    }

    /** A geometria do grupo mudou (os vértices enviados de novo): a caixa é refeita no próximo quadro. */
    geometryChanged(vertices: AnyBufferSpec | undefined): void {
        if (vertices === undefined) return;
        this.groups.forEach((g, i) => {
            if (g.vertices === vertices) this.boundsStale.add(i);
        });
    }

    /**
     * O quadro (numa transição): as capacidades, as tabelas quando os grupos mudam, os kernels, as caixas a refazer e os
     * parâmetros. Devolve se há o que desenhar.
     */
    prepare(
        groups: readonly CullGroup[],
        frame: CullFrame,
        hzb: BoundChannel | undefined,
    ): boolean {
        this.groups = groups;
        this.active = groups.length > 0;
        if (!this.active) return false;
        const slots = Math.max(1, ...groups.map((g) => g.first + g.count));
        this.ensureCapacity(groups.length, slots);
        if (slots > SCAN_GROUP ** SCAN_LEVELS)
            throw new RangeError(
                `DrawCulling: ${slots} posições na lista de instâncias (o descarte vai até ${SCAN_GROUP ** SCAN_LEVELS}).`,
            );
        this.steps.reserve(this.stepCount(groups.length));
        if (!this.bindSources()) {
            this.active = false;
            return false;
        }
        this.writeGroups(groups, slots);
        this.writeSteps();
        this.ensureHzbKernel(frame);
        this.rebuildBounds();
        this.enabledNow = this.indirect && frame.enabled && this.hzbKernel !== undefined;
        this.occlusionNow = this.enabledNow && hzb?.age(1) === 1;
        this.writeParams(frame.cameraSlot);
        return true;
    }

    /**
     * Antes da fase 1 do desenho: as contagens produzidas na GPU nos modelos, as caixas, a fase 1, a lista 1 e os
     * argumentos dela (sem as duas fases, também os da lista 2 — vazia — e das duas juntas).
     */
    recordEarly(frame: Frame): void {
        const template = this.buffer(TEMPLATE);
        if (template !== undefined)
            for (const s of this.sources)
                frame.copy(s.buffer, template, 4, s.offset, s.group * ARGS_WORDS * 4);
        const pipelines = this.ctx.work.pipelines;
        frame.compute('ForwardFlow.cull', (pass) => {
            for (const b of this.boundsRun) {
                pipelines.use(pass.bind, b.kernel, {
                    draw: [this.steps.offset(this.groupStep(b.group))],
                });
                pass.dispatch.workgroups(1);
            }
            this.run(pass, 'dc_phase1_main', this.slotCount);
            this.recordScan(pass, 0);
            this.run(pass, 'dc_scatter_main', this.slotCount, 0);
            this.run(pass, 'dc_args_main', this.groups.length, 0);
            if (!this.twoPhase) this.run(pass, 'dc_args_main', this.groups.length, 1);
        });
        // As caixas estáticas ficam; as deformadas são refeitas no próximo quadro.
        this.boundsRun = this.boundsRun.filter((b) => this.groups[b.group]?.deforming === true);
    }

    /**
     * Depois da fase 1 do desenho (com as duas fases): a hierarquia deste quadro pela profundidade, a fase 2 contra ela,
     * a lista 2 e os argumentos dela e das duas juntas. A fatia da série fica gravada (o quadro seguinte a lê).
     */
    recordLate(frame: Frame, hzb: BoundChannel): void {
        const pipelines = this.ctx.work.pipelines;
        const levels = hzbLevels();
        frame.compute('ForwardFlow.cull', (pass) => {
            pipelines.use(pass.bind, this.hzbKernel!);
            pass.dispatch.workgroups(Math.ceil(HZB_WIDTH / 8), Math.ceil(HZB_HEIGHT / 8));
            for (let k = 1; k < levels; k++) {
                const [w, h] = hzbLevelSize(k);
                this.run(pass, 'dc_hzb_reduce_main', w * h, 2 + k);
            }
            if (this.occlusionNow) {
                this.run(pass, 'dc_phase2_main', this.slotCount);
                this.recordScan(pass, 1);
                this.run(pass, 'dc_scatter_main', this.slotCount, 1);
            }
            this.run(pass, 'dc_args_main', this.groups.length, 1);
        });
        hzb.written();
    }

    /** Solta os kernels (a C2 libera os buffers com o trabalho). */
    dispose(): void {
        const pipelines = this.ctx.work.pipelines;
        for (const id of this.kernels.values()) pipelines.release(id);
        for (const id of this.boundsKernels.values()) pipelines.release(id);
        if (this.hzbKernel !== undefined) pipelines.release(this.hzbKernel);
        this.kernels.clear();
        this.boundsKernels.clear();
        this.boundsRun = [];
        this.hzbKernel = undefined;
        this.hzbDepth = undefined;
        this.sourcesBound = '';
    }

    // ── preparação ─────────────────────────────────────────────────────────────────────────────────────────────────

    /**
     * Regiões dos passos: as duas listas, os níveis da hierarquia, os níveis da soma de prefixos de cada lista e a caixa
     * de cada grupo.
     */
    private stepCount(groups: number): number {
        return this.groupStep(groups);
    }

    private scanStep(list: number, level: number): number {
        return 2 + hzbLevels() + list * SCAN_LEVELS + level;
    }

    private groupStep(group: number): number {
        return 2 + hzbLevels() + 2 * SCAN_LEVELS + group;
    }

    /** As regiões dos passos (os valores mudam com as posições da lista; escritas só então). */
    private writeSteps(): void {
        const counts = scanLevelCounts(this.slotCount);
        const key = `${this.sourcesBound}|${counts.join(',')}|${this.steps.capacity}`;
        if (key === this.stepsKey) return;
        const offsets = [0];
        for (let k = 1; k <= counts.length; k++)
            offsets.push(k === 1 ? 0 : offsets[k - 1]! + counts[k - 1]!);
        const zero = [0, 0, 0, 0];
        const count = this.steps.capacity;
        for (let i = 0; i < count; i++) this.steps.write(i, { value: zero, scan: zero });
        this.steps.write(0, { value: [0, 0, 0, 0], scan: zero });
        this.steps.write(1, { value: [1, 0, 0, 0], scan: zero });
        for (let k = 0; k < hzbLevels(); k++)
            this.steps.write(2 + k, { value: [k, 0, 0, 0], scan: zero });
        for (let list = 0; list < 2; list++)
            counts.forEach((n, k) => {
                if (k >= SCAN_LEVELS) return;
                this.steps.write(this.scanStep(list, k), {
                    value: [list, k, 0, 0],
                    scan: [n, offsets[k]!, offsets[k + 1]!, 0],
                });
            });
        for (let g = 0; this.groupStep(g) < count; g++)
            this.steps.write(this.groupStep(g), { value: [g, 0, 0, 0], scan: zero });
        this.steps.flush(count);
        this.stepsKey = key;
    }

    /** A soma de prefixos inclusiva das marcas da lista `list`, no lugar: subida, topo e descida. */
    private recordScan(pass: Parameters<Parameters<Frame['compute']>[1]>[0], list: number): void {
        const counts = scanLevelCounts(this.slotCount);
        const top = counts.length - 1;
        const use = (entry: string, level: number): void =>
            this.ctx.work.pipelines.use(pass.bind, this.kernels.get(entry)!, {
                draw: [this.steps.offset(this.scanStep(list, level))],
            });
        for (let k = 0; k < top; k++) {
            use('dc_scan_up_main', k);
            pass.dispatch.invocations(counts[k]!, SCAN_GROUP);
        }
        use('dc_scan_top_main', top);
        pass.dispatch.workgroups(1);
        for (let k = top - 1; k >= 0; k--) {
            use('dc_scan_down_main', k);
            pass.dispatch.invocations(counts[k]!, SCAN_GROUP);
        }
    }

    private run(
        pass: Parameters<Parameters<Frame['compute']>[1]>[0],
        entry: string,
        invocations: number,
        step?: number,
    ): void {
        if (invocations === 0) return;
        this.ctx.work.pipelines.use(
            pass.bind,
            this.kernels.get(entry)!,
            step === undefined ? undefined : { draw: [this.steps.offset(step)] },
        );
        pass.dispatch.invocations(invocations, WORKGROUP_SIZE);
    }

    private buffer(id: string): AnyBufferSpec | undefined {
        return this.ctx.resources.bufferOf(this.ctx.work, id);
    }

    private idOf(o: object): number {
        let id = this.ids.get(o);
        if (id === undefined) {
            id = this.nextId++;
            this.ids.set(o, id);
        }
        return id;
    }

    /** Capacidades por dobra; mudadas, a C2 realoca o trabalho e as tabelas e os kernels são refeitos. */
    private ensureCapacity(groups: number, slots: number): void {
        const grow = (have: number, need: number): number => {
            let n = Math.max(1, have);
            while (n < need) n *= 2;
            return n;
        };
        const next = {
            groups: grow(this.capacity.groups, groups),
            slots: grow(this.capacity.slots, slots),
        };
        if (next.groups === this.capacity.groups && next.slots === this.capacity.slots) return;
        this.capacity = next;
        this.ctx.work.refresh();
        this.groupsKey = '';
        this.paramsKey = '';
    }

    /** As fontes privadas comuns aos kernels. */
    private privateSources(): Map<WgslResource, BindingSource> | undefined {
        const R = drawCullResources;
        const need = [
            PARAMS,
            GROUPS,
            TEMPLATE,
            SLOT_GROUP,
            BOUNDS,
            FLAGS_A,
            FLAGS_B,
            VISIBLE,
            ARGS,
            SCAN,
        ];
        const buffers = need.map((id) => this.buffer(id));
        if (buffers.some((b) => b === undefined || b.subkind === 'staging')) return undefined;
        const [params, groups, template, slotGroup, bounds, flagsA, flagsB, visible, args, scan] =
            buffers as AnyBufferSpec[];
        const src = (b: AnyBufferSpec): BindingSource => b as BindingSource;
        return new Map<WgslResource, BindingSource>([
            [R.params, src(params!)],
            [R.step, this.steps.source()],
            [R.groups, src(groups!)],
            [R.template, src(template!)],
            [R.slotGroup, src(slotGroup!)],
            [R.boundsRead, src(bounds!)],
            [R.bounds, src(bounds!)],
            [R.flagsA, src(flagsA!)],
            [R.flagsB, src(flagsB!)],
            [R.scanLevels, src(scan!)],
            [R.visible, src(visible!)],
            [R.args, src(args!)],
        ]);
    }

    /** A chave dos buffers ligados (mudou: os kernels são refeitos). */
    private sourcesKey(): string {
        const ids = [
            PARAMS,
            GROUPS,
            TEMPLATE,
            SLOT_GROUP,
            BOUNDS,
            FLAGS_A,
            FLAGS_B,
            VISIBLE,
            ARGS,
            SCAN,
        ];
        return [
            ...ids.map((id) => {
                const b = this.buffer(id);
                return b === undefined ? 0 : this.idOf(b);
            }),
            this.steps.generation,
        ].join(':');
    }

    /**
     * Liga os buffers do trabalho aos pipelines (de novo quando a C2 os realoca: só os grupos de ligação mudam, os
     * pipelines ficam) e prepara os pipelines fixos na primeira vez.
     */
    private bindSources(): boolean {
        const key = this.sourcesKey();
        if (key === this.sourcesBound) return true;
        const sources = this.privateSources();
        if (sources === undefined) return false;
        const pipelines = this.ctx.work.pipelines;
        pipelines.bind(sources);
        if (this.kernels.size === 0)
            for (const entry of [
                'dc_phase1_main',
                'dc_phase2_main',
                'dc_scatter_main',
                'dc_args_main',
                'dc_hzb_reduce_main',
                'dc_scan_up_main',
                'dc_scan_top_main',
                'dc_scan_down_main',
            ]) {
                const id = `forward_cull:${entry}`;
                pipelines.prepare({ id, role: 'compute', shader: drawCull, entryPoints: [entry] });
                this.kernels.set(entry, id);
            }
        this.sourcesBound = key;
        this.groupsKey = '';
        this.stepsKey = '';
        return true;
    }

    /** O pipeline do nível 0 da hierarquia (pela profundidade com ou sem amostras) e a profundidade ligada a ele. */
    private ensureHzbKernel(frame: CullFrame): void {
        if (frame.depth === this.hzbDepth && this.hzbKernel !== undefined) return;
        const pipelines = this.ctx.work.pipelines;
        this.hzbDepth = frame.depth;
        if (frame.depth === undefined) return;
        const R = drawCullResources;
        const id = frame.multisampled ? 'forward_cull:hzb_base_ms' : 'forward_cull:hzb_base';
        pipelines.bind(
            new Map<WgslResource, BindingSource>([
                [frame.multisampled ? R.depthMs : R.depth, frame.depth as BindingSource],
            ]),
        );
        if (this.hzbKernel === id) return;
        if (this.hzbKernel !== undefined) pipelines.release(this.hzbKernel);
        pipelines.prepare({
            id,
            role: 'compute',
            shader: frame.multisampled ? drawCullHzb.multisampled : drawCullHzb.single,
            entryPoints: [frame.multisampled ? 'dc_hzb_base_ms_main' : 'dc_hzb_base_single_main'],
        });
        this.hzbKernel = id;
    }

    /** As tabelas (grupos, modelos dos argumentos, o grupo de cada posição) quando os grupos mudam. */
    private writeGroups(groups: readonly CullGroup[], slots: number): void {
        this.sources = [];
        groups.forEach((g, index) => {
            if (g.source !== undefined)
                this.sources.push({
                    group: index,
                    buffer: g.source.buffer,
                    offset: g.source.offset,
                });
        });
        const key = [
            this.sourcesBound,
            ...groups.map(
                (g) =>
                    `${g.key}:${g.first}:${g.count}:${g.cull ? 1 : 0}:${g.indexed ? 1 : 0}:${g.drawCount}:${
                        g.vertices === undefined ? 0 : this.idOf(g.vertices)
                    }`,
            ),
        ].join(';');
        if (key === this.groupsKey) return;
        const c = this.capacity;
        const table = new Uint32Array(c.groups * GROUP_WORDS);
        const template = new Uint32Array(c.groups * ARGS_WORDS);
        const slotGroup = new Uint32Array(c.slots).fill(SKIP);
        this.groupIndex.clear();
        groups.forEach((g, index) => {
            const flags = (g.cull ? 0 : NO_CULL) | (g.indexed ? 0 : NON_INDEXED);
            table.set([g.first, g.count, flags, 0], index * GROUP_WORDS);
            template.set([g.drawCount, 0, 0, 0, 0], index * ARGS_WORDS);
            slotGroup.fill(index, g.first, g.first + g.count);
            this.groupIndex.set(g.key, index);
            this.boundsStale.add(index);
        });
        const resources = this.ctx.resources;
        resources.writeNow(this.ctx.work, GROUPS, table);
        resources.writeNow(this.ctx.work, TEMPLATE, template);
        resources.writeNow(this.ctx.work, SLOT_GROUP, slotGroup);
        this.groupsKey = key;
        this.slotCount = slots;
        this.paramsKey = '';
    }

    /**
     * O pipeline da caixa por buffer de vértices (ligado a ele; o mesmo buffer o reaproveita, o dos vértices que saíram é
     * liberado) e os grupos a refazer neste quadro: os novos, os mudados e os deformados pela GPU.
     */
    private rebuildBounds(): void {
        const pipelines = this.ctx.work.pipelines;
        const used = new Set<AnyBufferSpec>();
        const run = new Map<number, string>();
        for (const b of this.boundsRun) run.set(b.group, b.kernel);
        this.groups.forEach((g, index) => {
            if (!g.cull || g.vertices === undefined || g.vertices.subkind === 'staging') return;
            used.add(g.vertices);
            let id = this.boundsKernels.get(g.vertices);
            if (id === undefined) {
                id = `forward_cull:bounds:${this.boundsSerial++}`;
                pipelines.bind(
                    new Map([
                        [
                            { pipeline: id, resource: vertexBoundsResource },
                            g.vertices as BindingSource,
                        ],
                    ]),
                );
                pipelines.prepare({
                    id,
                    role: 'compute',
                    shader: drawCullBounds,
                    entryPoints: ['dc_bounds_main'],
                });
                this.boundsKernels.set(g.vertices, id);
                this.boundsStale.add(index);
            }
            if (this.boundsStale.has(index) || g.deforming) run.set(index, id);
        });
        for (const [v, id] of [...this.boundsKernels]) {
            if (used.has(v)) continue;
            pipelines.release(id);
            this.boundsKernels.delete(v);
        }
        this.boundsStale.clear();
        this.boundsRun = [...run]
            .filter(([group]) => group < this.groups.length)
            .map(([group, kernel]) => ({ group, kernel }));
    }

    /** Os parâmetros do quadro, escritos quando mudam. */
    private writeParams(cameraSlot: number): void {
        const flags = (this.enabledNow ? ENABLED : 0) | (this.occlusionNow ? OCCLUSION : 0);
        const values = {
            counts: [cameraSlot, this.slotCount, this.groups.length, flags],
            hzb: [HZB_WIDTH, HZB_HEIGHT, hzbLevels(), 0],
        };
        const key = JSON.stringify(values);
        if (key === this.paramsKey) return;
        this.ctx.resources.writeNow(this.ctx.work, PARAMS, DrawCullParamsSchema.pack(values));
        this.paramsKey = key;
    }
}
