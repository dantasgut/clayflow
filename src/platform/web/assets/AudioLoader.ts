/**
 * Audio asset carregado pelo `AudioLoader`. `decoded` é null em ambientes
 * sem AudioContext (Node-side rendering, tests, browsers que negaram
 * permissão de audio).
 */
export interface LoadedAudio {
    /** URL de origem (debug). */
    readonly url: string;
    /** Bytes raw do arquivo audio (preservados para re-decode ou análise). */
    readonly buffer: ArrayBuffer;
    /** AudioBuffer decoded pelo Web Audio API, ou null se decode falhou. */
    readonly decoded: AudioBuffer | null;
    /** Duração em segundos (0 se decode falhou). */
    readonly duration: number;
    /** Número de canais (1 = mono, 2 = stereo, etc.). */
    readonly numberOfChannels: number;
    /** Sample rate em Hz (e.g. 44100). */
    readonly sampleRate: number;
}

/**
 * AudioLoader carrega arquivos de audio (mp3, ogg, wav) via fetch +
 * Web Audio API decodeAudioData. Cria um AudioContext lazy na primeira
 * chamada (compartilhado entre loads/plays).
 *
 * Suporte limitado: não faz spatial audio (PannerNode), apenas decode +
 * play simples com volume + loop. Apps que precisam de mais devem
 * acessar `audio.decoded` direto e usar Web Audio API completa.
 */
export class AudioLoader {
    private audioContext: AudioContext | null = null;

    private getContext(): AudioContext | null {
        if (typeof AudioContext === 'undefined') return null;
        if (this.audioContext === null) this.audioContext = new AudioContext();
        return this.audioContext;
    }

    /**
     * Carrega um audio asset. Em ambientes sem AudioContext, retorna
     * LoadedAudio com `decoded: null` mas preserva o `buffer` raw.
     */
    async load(url: string): Promise<LoadedAudio> {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const ctx = this.getContext();
        if (ctx === null) {
            return { url, buffer, decoded: null, duration: 0, numberOfChannels: 0, sampleRate: 0 };
        }
        try {
            const decoded = await ctx.decodeAudioData(buffer.slice(0));
            return {
                url,
                buffer,
                decoded,
                duration: decoded.duration,
                numberOfChannels: decoded.numberOfChannels,
                sampleRate: decoded.sampleRate,
            };
        } catch {
            return { url, buffer, decoded: null, duration: 0, numberOfChannels: 0, sampleRate: 0 };
        }
    }

    /**
     * Reproduz um audio decoded com gain (volume) e loop opcionais.
     * Returns o source node (chame `.stop()` para interromper) ou null
     * se sem AudioContext / sem decoded.
     */
    play(
        audio: LoadedAudio,
        options: { volume?: number; loop?: boolean } = {},
    ): AudioBufferSourceNode | null {
        const ctx = this.getContext();
        if (ctx === null || audio.decoded === null) return null;
        const src = ctx.createBufferSource();
        src.buffer = audio.decoded;
        src.loop = options.loop ?? false;
        const gain = ctx.createGain();
        gain.gain.value = options.volume ?? 1;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
        return src;
    }
}
