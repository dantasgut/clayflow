export interface LoadedAudio {
    readonly url: string;
    readonly buffer: ArrayBuffer;
    readonly decoded: AudioBuffer | null;
    readonly duration: number;
    readonly numberOfChannels: number;
    readonly sampleRate: number;
}

export class AudioLoader {
    private audioContext: AudioContext | null = null;

    private getContext(): AudioContext | null {
        if (typeof AudioContext === 'undefined') return null;
        if (this.audioContext === null) this.audioContext = new AudioContext();
        return this.audioContext;
    }

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
                url, buffer, decoded,
                duration: decoded.duration,
                numberOfChannels: decoded.numberOfChannels,
                sampleRate: decoded.sampleRate,
            };
        } catch {
            return { url, buffer, decoded: null, duration: 0, numberOfChannels: 0, sampleRate: 0 };
        }
    }

    play(audio: LoadedAudio, options: { volume?: number; loop?: boolean } = {}): AudioBufferSourceNode | null {
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
