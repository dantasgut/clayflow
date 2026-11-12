import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type {
    AnyBufferSpec,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { BindingKey, BindingSource } from '../../scene/flows/FlowBinding';
import type { WorkContext, WorkPart } from '../../scene/flows/FlowWork';
import type { EntityId } from '../../scene/world/EntityId';
import { Compaction } from '../../elements/gpu/compute/Compaction';
import { CountToArgs } from '../../elements/gpu/compute/CountToArgs';
import { wordBuffer } from '../../elements/gpu/compute/schemas';
import { particlePoolResource } from '../../elements/material/renderResources';
import { SET_COUNT_DRAW_OFFSET, SetCountSchema } from '../../scene/graph/SetCountSchema';
import { HZB_HEIGHT, HZB_WIDTH, hzbLevels } from '../../elements/render/reference/drawCull';
import { particleCull, particleCullResources } from './shaders';

/** Palavras do corpo (`pc_body`, ver `particle_cull.wgsl`). */
const BODY_WORDS = 12;
/** Bit do corpo: o descarte desligado (todas entram). */
const KEEP_ALL = 1;
/** A palavra do corpo que diz se a hierarquia vale neste quadro (`PC_HZB_VALID`), copiada no fluxo de comandos. */
const HZB_VALID_BYTE = 9 * 4;
/** Id da palavra 1 copiada para ela. */
const ONE = 'particle_cull_one';

/** O que o corpo desenhado passa ao descarte a cada quadro. */
export interface CullBodyInput {
    readonly entity: EntityId;
    /** Partículas do corpo (as `[0, count)` da faixa dele). */
    readonly count: number;
    /** O pool do corpo (o buffer da C2; muda quando o pool cresce). */
    readonly pool: StorageBufferSpec;
    readonly first: number;
    readonly strideVec4: number;
    readonly posOffsetVec4: number;
    readonly materialSlot: number;
    readonly cameraSlot: number;
    /** O descarte ligado (`FrameTargets.culling`). */
    readonly enabled: boolean;
}

/** O estado de um corpo: a capacidade da lista, a compactação ligada aos buffers dela e as palavras escritas. */
interface BodyState {
    capacity: number;
    serial: number;
    compaction: Compaction | undefined;
    /** Os buffers e o pool a que a compactação está ligada. */
    boundKey: string;
    wordsKey: string;
}

/**
 * O descarte das partículas pela GPU (spec 034, T060d) — parte do trabalho do `ParticleFlow`: por corpo, a compactação
 * estável (`Compaction`) das partículas cuja esfera toca o tronco da vista e não está escondida pela hierarquia de
 * profundidade deste quadro (a série do desenho principal), na ordem do corpo; a contagem vira os argumentos do desenho
 * indireto (`CountToArgs`: 6 vértices por instância, uma instância por partícula visível) e o sprite lê
 * `particle_list[instância]`. A lista e os argumentos nunca voltam à CPU; a CPU escreve as palavras do corpo só quando
 * mudam.
 */
export class ParticleCulling implements WorkPart {
    private readonly states = new Map<EntityId, BodyState>();
    private readonly toArgs: CountToArgs;
    private serial = 0;
    private oneWritten = false;
    private readonly ids = new WeakMap<object, number>();
    private nextId = 1;

    constructor(private readonly ctx: WorkContext) {
        this.toArgs = new CountToArgs(ctx, { discriminator: 'particle_cull' });
        ctx.work.use(this);
    }

    descriptors(): readonly GPUDescriptor[] {
        const out: GPUDescriptor[] = [wordBuffer(ONE, 16)];
        for (const [entity, s] of this.states) {
            const p = this.prefix(entity, s);
            out.push(
                wordBuffer(`${p}:body`, BODY_WORDS * 4),
                wordBuffer(`${p}:list`, s.capacity * 4),
                wordBuffer(`${p}:counter`, 16),
                wordBuffer(`${p}:args`, SetCountSchema.stride, 'indirect'),
            );
        }
        return out;
    }

    /**
     * Os corpos do quadro (em `framePrepare`): os que saíram soltam a compactação; a capacidade de cada lista dobra
     * quando o corpo passa dela (a C2 realoca); a compactação é refeita quando o pool ou os buffers dela mudam; as
     * palavras do corpo são escritas quando mudam.
     */
    sync(bodies: readonly CullBodyInput[]): void {
        const keep = new Set(bodies.map((b) => b.entity));
        let reshaped = false;
        for (const [entity, s] of this.states) {
            if (keep.has(entity)) continue;
            s.compaction?.destroy();
            this.states.delete(entity);
            reshaped = true;
        }
        for (const b of bodies) {
            let s = this.states.get(b.entity);
            const need = Math.max(1, b.count);
            if (s === undefined) {
                s = { capacity: 0, serial: 0, compaction: undefined, boundKey: '', wordsKey: '' };
                this.states.set(b.entity, s);
            }
            if (need > s.capacity) {
                let n = Math.max(64, s.capacity);
                while (n < need) n *= 2;
                s.compaction?.destroy();
                s.compaction = undefined;
                s.capacity = n;
                s.serial = this.serial++;
                s.boundKey = '';
                s.wordsKey = '';
                reshaped = true;
            }
        }
        if (reshaped) this.ctx.work.refresh();
        const one = this.buffer(ONE);
        if (one === undefined) return;
        if (!this.oneWritten) {
            this.ctx.resources.writeNow(this.ctx.work, ONE, new Uint32Array([1, 0, 0, 0]));
            this.oneWritten = true;
        }
        const levels = hzbLevels();
        for (const b of bodies) {
            const s = this.states.get(b.entity)!;
            const p = this.prefix(b.entity, s);
            const body = this.buffer(`${p}:body`);
            const list = this.buffer(`${p}:list`);
            const counter = this.buffer(`${p}:counter`);
            const args = this.buffer(`${p}:args`);
            if (body === undefined || list === undefined || counter === undefined) continue;
            if (args?.subkind !== 'indirect') continue;
            const words = [
                b.first,
                b.strideVec4,
                b.posOffsetVec4,
                b.materialSlot,
                b.cameraSlot,
                b.enabled ? 0 : KEEP_ALL,
                HZB_WIDTH,
                HZB_HEIGHT,
                levels,
            ];
            const wordsKey = words.join(':');
            if (wordsKey !== s.wordsKey) {
                const data = new Uint32Array(BODY_WORDS);
                data.set(words);
                this.ctx.resources.writeNow(this.ctx.work, `${p}:body`, data);
                s.wordsKey = wordsKey;
            }
            const boundKey = [b.pool, body, list, counter].map((o) => this.idOf(o)).join(':');
            if (boundKey === s.boundKey && s.compaction !== undefined) continue;
            s.compaction?.destroy();
            const R = particleCullResources;
            s.compaction = new Compaction(this.ctx, {
                discriminator: `${p}:${this.serial++}`,
                predicate: particleCull,
                capacity: s.capacity,
                stable: true,
                inputCapacity: s.capacity,
                bindings: new Map<BindingKey, BindingSource>([
                    [particlePoolResource, b.pool],
                    [R.body, body as BindingSource],
                ]),
            });
            s.compaction.prepare(list as StorageBufferSpec, counter as StorageBufferSpec, 1);
            this.toArgs.prepare(args, bodies.length);
            s.boundKey = boundKey;
        }
    }

    /** A lista do corpo (o `particle_list` do sprite dele), ou `undefined` antes da alocação. */
    list(entity: EntityId): StorageBufferSpec | undefined {
        const s = this.states.get(entity);
        if (s === undefined) return undefined;
        const b = this.buffer(`${this.prefix(entity, s)}:list`);
        return b?.subkind === 'storage' ? b : undefined;
    }

    /**
     * Grava a lista e os argumentos do corpo e devolve o buffer dos argumentos (o desenho em `SET_COUNT_DRAW_OFFSET`), ou
     * `undefined` se os kernels ainda compilam (o corpo não desenha neste quadro).
     */
    record(
        frame: Frame,
        entity: EntityId,
        count: number,
        hzb: boolean,
    ): IndirectBufferSpec | undefined {
        const s = this.states.get(entity);
        if (s?.compaction?.ready !== true) return undefined;
        const p = this.prefix(entity, s);
        const body = this.buffer(`${p}:body`);
        const one = this.buffer(ONE);
        const list = this.buffer(`${p}:list`);
        const counter = this.buffer(`${p}:counter`);
        const args = this.buffer(`${p}:args`);
        if (body === undefined || one === undefined || list === undefined || counter === undefined)
            return undefined;
        if (args?.subkind !== 'indirect' || !this.toArgs.ready(args)) return undefined;
        // `hzb`: o desenho principal gravou a hierarquia neste quadro (a série dele) — a palavra do corpo vale 1, copiada
        // no fluxo de comandos; senão 0 (só o tronco).
        if (hzb) frame.copy(one, body, 4, 0, HZB_VALID_BYTE);
        else frame.clear(body, HZB_VALID_BYTE, 4);
        s.compaction!.record(frame, {
            count: Math.min(count, s.capacity),
            out: list as StorageBufferSpec,
            counter: counter as StorageBufferSpec,
        });
        // O contador da compactação (aceitos) é a contagem do registro `SetCount`; os argumentos saem dela na GPU.
        frame.copy(counter, args, 4);
        this.toArgs.record(frame, {
            counts: args,
            index: 0,
            workgroupSize: WORKGROUP_SIZE.value,
            perElement: 6,
            instanced: true,
        });
        return args;
    }

    /** O byte dos argumentos do desenho no registro. */
    static readonly drawOffset = SET_COUNT_DRAW_OFFSET;

    /** Solta as compactações e a conversão (no descarte do Flow). */
    destroy(): void {
        for (const s of this.states.values()) s.compaction?.destroy();
        this.states.clear();
        this.toArgs.destroy();
    }

    private prefix(entity: EntityId, s: BodyState): string {
        return `particle_cull:${entity}:${s.serial}`;
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
}
