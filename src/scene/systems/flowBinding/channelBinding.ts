import type { ChannelSource, SliceSource } from '../../consumers/ResolvedSource';
import type { ChannelInfo } from '../../contracts/ResourceDirectory';
import type { BoundChannel } from '../../flows/slots';

/** A visão do canal para a ligação (uma por canal: a identidade conta para as fases do bind group). */
const sources = new WeakMap<ChannelInfo, ChannelSource>();

/** O anel do canal como fonte de ligação (spec 037): a fatia física pelo índice, a cabeça e o `epoch` vivos. */
export function channelSourceOf(channel: ChannelInfo, name: string): ChannelSource {
    let source = sources.get(channel);
    if (source === undefined) {
        source = {
            name,
            get depth() {
                return channel.depth;
            },
            get head() {
                return channel.head;
            },
            get epoch() {
                return channel.epoch;
            },
            sliceSource(index: number): SliceSource {
                // A fatia física `index` é a do atraso (cabeça − índice) agora.
                const d = channel.depth;
                const lag = (((channel.head - index) % d) + d) % d;
                const buffer = channel.buffer(lag);
                if (buffer !== undefined) {
                    if (buffer.subkind === 'staging') {
                        throw new Error(`canal temporal '${name}': fatia de staging não se liga.`);
                    }
                    return { kind: 'buffer', buffer };
                }
                const view = channel.view(lag);
                if (view === undefined) {
                    throw new Error(
                        `canal temporal '${name}': fatia ${index} sem buffer nem textura.`,
                    );
                }
                return {
                    kind: 'textureView',
                    view,
                    ...(channel.format !== undefined ? { format: channel.format } : {}),
                };
            },
        };
        sources.set(channel, source);
    }
    return source;
}

/** O canal visto pelo Flow (`slot.channel`): os dados vivos, `written()` e `invalidate()` do produtor. */
export function boundChannelOf(
    channel: ChannelInfo,
    written: () => void,
    invalidate: () => void,
): BoundChannel {
    return {
        get depth() {
            return channel.depth;
        },
        get allocated() {
            return channel.allocated;
        },
        get head() {
            return channel.head;
        },
        get frames() {
            return channel.frames;
        },
        get epoch() {
            return channel.epoch;
        },
        get format() {
            return channel.format;
        },
        texture: (lag) => channel.texture(lag),
        view: (lag) => channel.view(lag),
        buffer: (lag) => channel.buffer(lag),
        stamp: (lag) => channel.stamp(lag),
        age: (lag) => channel.age(lag),
        written,
        invalidate,
    };
}
