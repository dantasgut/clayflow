import type { EngineCore, StorageBufferSpec } from '../../core/contracts/index';
import {
    POOL_ARENA_ALIGN,
    POOL_ARENA_HEADER_WORDS,
    POOL_ARENA_SLOTS,
    poolArenaSlot,
    poolArenaKindOf,
    type PoolArenaKind,
    type PoolArenaRegion,
} from '../shaders/poolArena';

/** Uma região da arena: o índice no cabeçalho, o tamanho e a posição (bytes) e a capacidade em elementos. */
interface Region {
    readonly slot: number;
    bytes: number;
    elements: number;
    offset: number;
}

/**
 * Uma arena de pools da C2 (T060i; a da CPU ou a da GPU): um buffer de storage com o cabeçalho (as bases e as capacidades de cada região, em
 * palavras) e as regiões dos pools que moram nela, alinhadas a `POOL_ARENA_ALIGN` bytes (quem liga um pool tipado liga
 * a faixa da região). Existe desde a criação, só com o cabeçalho: quem lê pela arena não espera por ela. Uma região que
 * cresce realoca a arena inteira — o conteúdo de todas vai para o buffer novo por cópia na GPU — e o cabeçalho é
 * reescrito; `ensure` devolve se o buffer mudou (quem o liga religa). Nasce no primeiro uso (uma região ou quem a
 * liga), só com o cabeçalho.
 */
export class PoolArena {
    private readonly regions = new Map<PoolArenaRegion, Region>();
    private generation = 0;
    private current: StorageBufferSpec | undefined;

    constructor(
        private readonly core: EngineCore,
        private readonly kind: PoolArenaKind = 'cpu',
    ) {}

    /** O buffer da arena (criado no primeiro pedido, só com o cabeçalho). */
    get buffer(): StorageBufferSpec {
        if (this.current === undefined) {
            this.current = this.create(alignTo(POOL_ARENA_HEADER_WORDS * 4, POOL_ARENA_ALIGN));
            this.writeHeader();
        }
        return this.current;
    }

    /**
     * A região `key` com pelo menos `bytes` bytes e `elements` elementos. Devolve `true` quando a arena foi realocada
     * (crescimento ou região nova que não coube).
     */
    ensure(key: PoolArenaRegion, bytes: number, elements: number): boolean {
        const size = Math.max(POOL_ARENA_ALIGN, alignTo(bytes, POOL_ARENA_ALIGN));
        const r = this.regions.get(key);
        if (r !== undefined && r.bytes >= size) {
            if (r.elements !== elements) {
                r.elements = elements;
                this.writeHeader();
            }
            return false;
        }
        const previous = new Map([...this.regions].map(([k, v]) => [k, { ...v }]));
        if (r === undefined) {
            this.regions.set(key, {
                slot: poolArenaSlot(key, poolArenaKindOf(key) ?? this.kind),
                bytes: size,
                elements,
                offset: 0,
            });
        } else {
            r.bytes = size;
            r.elements = elements;
        }
        this.relayout(previous);
        return true;
    }

    /** A posição (bytes) da região `key` no buffer. */
    offsetOf(key: PoolArenaRegion): number {
        const r = this.regions.get(key);
        if (r === undefined) throw new Error(`PoolArena: região '${key}' não existe`);
        return r.offset;
    }

    /** O tamanho (bytes) da região `key`. */
    sizeOf(key: PoolArenaRegion): number {
        return this.regions.get(key)?.bytes ?? 0;
    }

    has(key: PoolArenaRegion): boolean {
        return this.regions.has(key);
    }

    destroy(): void {
        if (this.current !== undefined) this.core.destroy(this.current);
        this.current = undefined;
    }

    private relayout(previous: ReadonlyMap<PoolArenaRegion, Region>): void {
        let offset = alignTo(POOL_ARENA_HEADER_WORDS * 4, POOL_ARENA_ALIGN);
        for (const r of [...this.regions.values()].sort((a, b) => a.slot - b.slot)) {
            r.offset = offset;
            offset += r.bytes;
        }
        const old = this.current;
        ++this.generation;
        this.current = this.create(offset);
        // O conteúdo de cada região que já existia vai para a posição nova por cópia na GPU (num comando próprio: a
        // arena cresce fora da gravação de um quadro).
        const moves = [...previous].map(([k, p]) => ({
            from: p.offset,
            to: this.regions.get(k)!.offset,
            bytes: p.bytes,
        }));
        if (old !== undefined && moves.length > 0) {
            const target = this.current;
            this.core.record(`pool_arena_grow:${this.kind}:${this.generation}`, (frame) => {
                for (const m of moves) frame.copy(old, target, m.bytes, m.from, m.to);
            });
            this.core.submit();
        }
        if (old !== undefined) this.core.destroy(old);
        this.writeHeader();
    }

    private writeHeader(): void {
        const header = new Uint32Array(POOL_ARENA_HEADER_WORDS);
        for (const r of this.regions.values()) {
            header[r.slot] = r.offset / 4;
            header[POOL_ARENA_SLOTS + r.slot] = r.elements;
        }
        this.core.write(this.buffer, header, 0);
    }

    private create(byteSize: number): StorageBufferSpec {
        return this.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator:
                (this.kind === 'cpu' ? 'pool_arena' : 'pool_arena_gpu')
                + (this.generation === 0 ? '' : `:gen${this.generation}`),
            byteSize,
        });
    }
}

function alignTo(v: number, a: number): number {
    return Math.ceil(v / a) * a;
}
