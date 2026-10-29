import {
    Engine,
    type EngineCommonOptions,
    type EngineOptions,
    type PreparedEngine,
} from '../../presentation/app/Engine';
import type { FrameScheduler } from '../../presentation/app/FrameScheduler';
import type { CanvasPixels } from '../../scene/contracts/gpu';
import { TextureSurface } from '../../index';
import { DenoPlatformAdapter } from './DenoPlatformAdapter';
import { SdlInputDevice } from './SdlInputDevice';
import { SdlWindow, type SdlEvent } from './sdl';

/**
 * Opções do `Application` do Deno (spec 038, `clayflow/deno`): as do motor mais o alvo — uma janela nativa (`window`,
 * navegação em tempo real) ou uma textura (`target`, sem tela: `step` e `read`, para gravar e testar).
 */
export type DenoApplicationOptions = EngineCommonOptions
    & (
        | {
              readonly window: {
                  readonly title?: string;
                  readonly width: number;
                  readonly height: number;
                  /** Pixels da tela de alta densidade (padrão true; false: um pixel por ponto, mais barato). */
                  readonly highDpi?: boolean;
              };
          }
        | { readonly target: { readonly width: number; readonly height: number } }
    );

/**
 * Application — o motor no Deno (spec 038, `clayflow/deno`): o `Engine` com o adaptador de plataforma do Deno (o
 * `navigator.gpu` do wgpu) e, conforme o alvo, a janela SDL (o laço do Deno, os eventos da janela no `Input`, a
 * apresentação depois de cada quadro, o redimensionamento) ou a textura lida de volta.
 *
 * ```ts
 * import { Application, createScene } from 'clayflow/deno';
 * const app = await Application.create({ window: { title: 'clayflow', width: 1280, height: 720 }, scene: createScene() });
 * // … a cena …
 * await app.run(); // até a janela fechar
 * ```
 */
export class Application extends Engine {
    /** A janela (no modo janela). */
    readonly window: SdlWindow | undefined;
    private readonly sdlInput?: SdlInputDevice;
    private readonly resized?: () => void;
    private closed = false;
    private onClose: (() => void) | null = null;
    private presentOff: (() => void) | null = null;

    private constructor(
        options: EngineOptions,
        prepared: PreparedEngine,
        window: SdlWindow | undefined,
        input: { device: SdlInputDevice | undefined },
        resized: (() => void) | undefined,
    ) {
        super(options, prepared);
        this.window = window;
        if (input.device !== undefined) this.sdlInput = input.device;
        if (resized !== undefined) this.resized = resized;
        const present = options.surface?.present;
        if (window !== undefined && present !== undefined) {
            // A janela não apresenta sozinha: depois de cada quadro submetido.
            this.presentOff = this.events.on('frameComplete', () => {
                present();
            });
        }
    }

    /** Construtor async — a janela ou a textura, o device pelo Deno e os estágios padrão. */
    static override async create(options: DenoApplicationOptions): Promise<Application> {
        const platform = new DenoPlatformAdapter();
        let window: SdlWindow | undefined;
        const input: { device: SdlInputDevice | undefined } = { device: undefined };
        let engine: EngineOptions;
        let resized: (() => void) | undefined;
        // A aplicação criada no fim: o agendador a alcança pelos eventos da janela.
        const created: { app?: Application } = {};
        if ('window' in options) {
            const w = options.window;
            window = new SdlWindow(w.title ?? 'clayflow', w.width, w.height, w.highDpi ?? true);
            const surface = platform.getContext(window);
            resized = () => {
                surface.resized();
            };
            const events: SdlEvent[] = [];
            const scheduler: FrameScheduler = {
                request: (cb) =>
                    setTimeout(() => {
                        events.length = 0;
                        events.push(...window!.poll());
                        created.app?.handleWindow(events);
                        cb();
                    }, 0),
                cancel: (handle) => {
                    clearTimeout(handle as number);
                },
            };
            engine = {
                ...options,
                platform,
                surface,
                scheduler,
                inputDevices: (inp, bus) => {
                    input.device = new SdlInputDevice(inp, bus);
                    return [input.device];
                },
            };
        } else {
            const surface = new TextureSurface(options.target.width, options.target.height);
            engine = {
                ...options,
                // A leitura do quadro (`read`) copia a textura: o uso de cópia vem ligado.
                canvasOptions: { ...options.canvasOptions, capture: true },
                platform,
                surface,
            };
        }
        created.app = new Application(
            engine,
            await Engine.prepareFor(engine),
            window,
            input,
            resized,
        );
        return created.app;
    }

    /** Os pixels do último quadro (o modo textura; chame logo depois de `step`). */
    read(): Promise<CanvasPixels> {
        return this.core.readCanvas();
    }

    /** Roda o laço até a janela fechar (o modo janela). */
    run(): Promise<void> {
        if (this.window === undefined)
            return Promise.reject(
                new Error('Application.run(): só no modo janela — no modo textura, use step().'),
            );
        return new Promise((resolve) => {
            this.onClose = resolve;
            this.start();
        });
    }

    /** Os eventos da janela: fechar, redimensionar e a entrada. */
    private handleWindow(events: readonly SdlEvent[]): void {
        for (const e of events) {
            if (e.kind === 'quit') {
                this.closeWindow();
                return;
            }
            if (e.kind === 'resized') {
                this.resized?.();
                this.surfaceResized();
            }
        }
        this.sdlInput?.handle(events);
    }

    private closeWindow(): void {
        if (this.closed) return;
        this.closed = true;
        this.stop();
        const done = this.onClose;
        this.onClose = null;
        done?.();
    }

    protected override disposeEnvironment(): void {
        this.presentOff?.();
        this.presentOff = null;
        this.closeWindow();
        this.window?.close();
    }
}
