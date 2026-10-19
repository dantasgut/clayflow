/**
 * Página das demos gravadas em vídeo (`npm run video`, parâmetro `?case=`). Dois modos, chamados pelo runner:
 *
 * - `__demoExact()`: quadro a quadro com passo fixo de 1/60 s; cada quadro do canvas vai direto ao `VideoEncoder`
 *   (H.264, Annex B) e os pedaços saem por `__demoChunk` — a imagem exata do motor, sem o tempo real.
 * - `__demoRealtime()`: o laço normal (`requestAnimationFrame`, passo pelo relógio de parede) enquanto o runner
 *   captura a tela; devolve o intervalo de cada quadro (ms) — o desempenho real.
 *
 * `__demoMarker(on)` cobre o canvas de magenta para o runner achar a posição dele na tela.
 */

declare global {
    interface Window {
        __demoReady?: { title: string; seconds: number } | { error: string };
        __demoExact?: () => Promise<number>;
        __demoRealtime?: () => Promise<number[]>;
        __demoMarker?: (on: boolean) => void;
        /** Exposta pelo runner: recebe um pedaço do vídeo (base64). */
        __demoChunk?: (base64: string) => Promise<void>;
    }
}

const FPS = 60;

// As cenas moram com o suporte dos smokes (carregadas como os smokes, `bench/page/smoke.ts`).
const { DEMOS, VIDEO_SIZE } = await import('../../src/__smokes__/support/demoScenes');
type Demo = Awaited<ReturnType<(typeof DEMOS)[string]>>;
const log = document.getElementById('log');

function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

/** H.264 High, 1280×720 a 60 FPS; o perfil básico se o alto não for aceito. */
async function encoderConfig(): Promise<VideoEncoderConfig> {
    for (const codec of ['avc1.640032', 'avc1.42E032']) {
        const config: VideoEncoderConfig = {
            codec,
            width: VIDEO_SIZE.width,
            height: VIDEO_SIZE.height,
            framerate: FPS,
            bitrate: 30_000_000,
            latencyMode: 'quality',
            avc: { format: 'annexb' },
        };
        if ((await VideoEncoder.isConfigSupported(config)).supported === true) return config;
    }
    throw new Error('VideoEncoder sem H.264 neste navegador');
}

async function exact(demo: Demo): Promise<number> {
    const send = window.__demoChunk;
    if (send === undefined) throw new Error('__demoChunk ausente (rode pelo npm run video)');
    const frames = Math.round(demo.seconds * FPS);
    // Objeto (não `let`): o erro chega pelo callback e o TypeScript não acompanha a atribuição dentro dele.
    const state: { failure: Error | null } = { failure: null };
    let pending = Promise.resolve();
    const encoder = new VideoEncoder({
        output(chunk) {
            const bytes = new Uint8Array(chunk.byteLength);
            chunk.copyTo(bytes);
            pending = pending.then(() => send(toBase64(bytes)));
        },
        error(e) {
            state.failure = e;
        },
    });
    encoder.configure(await encoderConfig());
    for (let i = 0; i < frames; i++) {
        if (state.failure !== null) throw new Error(`VideoEncoder: ${state.failure.message}`);
        demo.tick(i / (frames - 1));
        demo.app.step(1 / FPS);
        // O quadro lido do canvas logo depois do passo (antes da apresentação), como o `capture` dos smokes.
        const frame = new VideoFrame(demo.canvas, { timestamp: Math.round((i * 1e6) / FPS) });
        encoder.encode(frame, { keyFrame: i % FPS === 0 });
        frame.close();
        if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    }
    await encoder.flush();
    encoder.close();
    await pending;
    if (state.failure !== null) throw new Error(`VideoEncoder: ${state.failure.message}`);
    return frames;
}

function realtime(demo: Demo): Promise<number[]> {
    return new Promise((done, fail) => {
        const intervals: number[] = [];
        // O relógio começa no primeiro quadro: com vsync o carimbo do rAF é o início do quadro, anterior ao
        // `performance.now()` de quem o pediu (o passo sairia negativo).
        let t0 = -1;
        let last = 0;
        // Se o rAF parar (janela escondida, aba em segundo plano), falha em vez de prender a gravação.
        const watchdog = setTimeout(() => {
            fail(new Error(`rAF parado: ${intervals.length} quadros em ${demo.seconds * 3} s`));
        }, demo.seconds * 3000);
        const frame = (now: number): void => {
            if (t0 < 0) t0 = last = now;
            const t = (now - t0) / (demo.seconds * 1000);
            if (t >= 1) {
                clearTimeout(watchdog);
                done(intervals);
                return;
            }
            if (now > t0) intervals.push(now - last);
            const dt = Math.min(0.1, (now - last) / 1000) || 1 / FPS;
            last = now;
            try {
                demo.tick(t);
                demo.app.step(dt);
            } catch (e) {
                clearTimeout(watchdog);
                fail(e instanceof Error ? e : new Error(String(e)));
                return;
            }
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    });
}

const name = new URLSearchParams(location.search).get('case') ?? '';
const make = DEMOS[name];
if (make === undefined) window.__demoReady = { error: `demo desconhecida: ${name}` };
else
    make().then(
        (demo) => {
            if (log !== null) log.textContent = demo.title;
            const marker = document.getElementById('marker');
            window.__demoMarker = (on) => {
                if (marker === null) return;
                marker.style.width = `${VIDEO_SIZE.width}px`;
                marker.style.height = `${VIDEO_SIZE.height}px`;
                marker.style.display = on ? 'block' : 'none';
            };
            window.__demoExact = () => exact(demo);
            window.__demoRealtime = () => realtime(demo);
            window.__demoReady = { title: demo.title, seconds: demo.seconds };
        },
        (e: unknown) => {
            window.__demoReady = { error: e instanceof Error ? e.message : String(e) };
        },
    );
