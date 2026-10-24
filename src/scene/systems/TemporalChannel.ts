import type { AnyBufferSpec, TextureSpec, TextureViewSpec } from '../../core/contracts/index';
import type { ChannelInfo, ChannelStamp } from '../contracts/ResourceDirectory';

/** Uma fatia do anel: a textura e a vista, ou o buffer do pool. */
export interface ChannelSlice {
    readonly texture?: TextureSpec;
    readonly view?: TextureViewSpec;
    readonly buffer?: AnyBufferSpec;
}

/**
 * Estado de um canal temporal (spec 037): o anel de fatias, a cabeça (a fatia do atraso 0), os quadros gravados seguidos
 * desde a última invalidação e o carimbo de cada fatia. A C2 gira o anel no `frameRecording` só se o produtor gravou a
 * fatia atual no quadro anterior (`markWritten`); `epoch` muda quando as fatias são recriadas (quem liga refaz o bind
 * group).
 */
export class TemporalChannel implements ChannelInfo {
    head = 0;
    frames = 0;
    /** Muda a cada troca das fatias (recriação, crescimento do pool). */
    epoch = 0;
    private written = false;
    /** O quadro corrente (a contagem da C2 no último giro). */
    private now = 0;
    private slices: readonly ChannelSlice[] = [];
    private readonly stamps: (ChannelStamp | undefined)[];
    /** Formato resolvido das fatias de textura (`undefined` num canal de buffer). */
    format: GPUTextureFormat | undefined;

    constructor(
        /** Nome para mensagens (`Schema.descId` ou a chave do pool). */
        readonly name: string,
        readonly depth: number,
        format?: GPUTextureFormat,
    ) {
        this.format = format;
        if (!Number.isInteger(depth) || depth < 2) {
            throw new RangeError(
                `canal temporal '${name}': depth ${depth} (a série tem ao menos a fatia atual e a anterior: inteiro ≥ 2).`,
            );
        }
        this.stamps = new Array<ChannelStamp | undefined>(depth).fill(undefined);
    }

    /** Fatias novas (alocação, recriação): a série recomeça. */
    replaceSlices(slices: readonly ChannelSlice[]): void {
        if (slices.length !== this.depth) {
            throw new Error(
                `canal temporal '${this.name}': ${slices.length} fatias para depth ${this.depth}.`,
            );
        }
        this.slices = slices;
        this.head = 0;
        this.epoch++;
        this.invalidate();
    }

    /** As fatias existem (o canal de um descritor sob demanda nasce sem elas, até o pedido)? */
    get allocated(): boolean {
        return this.slices.length > 0;
    }

    /** Todas as fatias, na ordem física (para liberar). */
    allSlices(): readonly ChannelSlice[] {
        return this.slices;
    }

    /** Índice físico da fatia do atraso `lag` na cabeça `head`. */
    indexAt(lag: number, head = this.head): number {
        if (!Number.isInteger(lag) || lag < 0 || lag >= this.depth) {
            throw new RangeError(
                `canal temporal '${this.name}': atraso ${lag} fora de [0, ${this.depth - 1}].`,
            );
        }
        return (head - lag + this.depth) % this.depth;
    }

    /** A fatia física `index`. */
    sliceAt(index: number): ChannelSlice {
        const slice = this.slices[index];
        if (slice === undefined) {
            throw new Error(`canal temporal '${this.name}': fatias ainda não alocadas.`);
        }
        return slice;
    }

    slice(lag: number): ChannelSlice {
        return this.sliceAt(this.indexAt(lag));
    }

    texture(lag: number): TextureSpec | undefined {
        return this.allocated ? this.slice(lag).texture : (this.indexAt(lag), undefined);
    }

    view(lag: number): TextureViewSpec | undefined {
        return this.allocated ? this.slice(lag).view : (this.indexAt(lag), undefined);
    }

    buffer(lag: number): AnyBufferSpec | undefined {
        return this.allocated ? this.slice(lag).buffer : (this.indexAt(lag), undefined);
    }

    /** Carimbo da fatia do atraso `lag`: a atual só depois de gravada no quadro; a anterior `k` com `frames ≥ k`. */
    stamp(lag: number): ChannelStamp | undefined {
        const index = this.indexAt(lag);
        if (lag === 0) return this.written ? this.stamps[index] : undefined;
        return this.frames >= lag ? this.stamps[index] : undefined;
    }

    /** A fatia atual foi gravada no quadro de carimbo `stamp`. */
    markWritten(stamp: ChannelStamp): void {
        this.written = true;
        this.stamps[this.head] = stamp;
    }

    /** Gravada no quadro em curso? */
    get writtenThisFrame(): boolean {
        return this.written;
    }

    /** Quadros desde que a fatia do atraso `lag` foi gravada (0 = no quadro corrente), ou `undefined` se ela não vale. */
    age(lag: number): number | undefined {
        const stamp = this.stamp(lag);
        return stamp === undefined ? undefined : this.now - stamp.frame;
    }

    /** Início do quadro `now`: gira o anel se a fatia atual foi gravada no quadro anterior. Devolve se girou. */
    advance(now = this.now + 1): boolean {
        this.now = now;
        if (!this.written) return false;
        this.written = false;
        this.head = (this.head + 1) % this.depth;
        this.stamps[this.head] = undefined;
        this.frames++;
        return true;
    }

    /** A continuidade quebrou: nenhuma fatia anterior vale. */
    invalidate(): void {
        this.frames = 0;
        this.written = false;
        this.stamps.fill(undefined);
    }
}
