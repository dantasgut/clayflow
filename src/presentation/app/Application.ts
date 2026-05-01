import { defaultScene } from '../../scene/index';
import type {
    CanvasOptions,
    EngineCore,
    SceneContext,
    EventBus,
    FlowRegistry,
    World,
} from '../../scene/index';
import type { ConsumerResolverRegistry } from '../../scene/consumers/ConsumerResolverRegistry';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { LayoutInferencer } from '../../scene/systems/LayoutInferencer';
import type { ExecutionSystem } from '../../scene/systems/ExecutionSystem';
import { GameLoop } from './GameLoop';
import { Time } from './Time';
import { registerPresentationDefaults, type PresentationDefaults } from '../flows/defaults';
import type { EnginePlugin } from '../plugins/EnginePlugin';

/**
 * Opções de inicialização do `Application`. Apenas `canvas` é obrigatório;
 * defaults sensíveis para o resto. Use `scene` para multi-Application,
 * `captureErrors`/`memoryBudgetMB` para resiliência em produção.
 */
export interface ApplicationOptions {
    /** HTMLCanvasElement onde a engine renderiza. Deve estar attachado ao DOM. */
    canvas: HTMLCanvasElement;
    /** Configuração do swapchain (alphaMode, colorSpace). Default: opaque/srgb. */
    canvasOptions?: CanvasOptions;
    /** Auto-attach window.resize listener (default true em ambiente browser). */
    autoResize?: boolean;
    /** Debounce em ms para o handler de resize (default 100). */
    resizeDebounceMs?: number;
    /**
     * Quando true, cada frame abre um WebGPU error scope `validation`. Erros viram
     * eventos `engineError` (stage='frame') em vez de exceptions — o GameLoop
     * continua o próximo frame. Útil em produção para resiliência ou em dev para
     * surfacing erros sem crash. Default: false (custo de push/pop por frame).
     */
    captureErrors?: boolean;
    /**
     * Threshold (MiB) de GPU memory acima do qual `memoryWarning` é emitido
     * (uma vez por transição abaixo→acima). Default: undefined (sem warning).
     * `core.memoryUsage()` continua sempre disponível para inspeção sob demanda.
     */
    memoryBudgetMB?: number;
    /**
     * SceneContext customizado. Quando omitido, usa o singleton default
     * (compatibilidade). Forneça via `createScene()` para múltiplas
     * Applications no mesmo processo (multi-canvas, tests isolados).
     */
    scene?: SceneContext;
}

/**
 * Application — bootstrap das 4 camadas da engine sobre um `<canvas>`.
 *
 * Ciclo de vida:
 *   1. `await Application.create({ canvas })` adquire device/queue, configura
 *      swapchain, instancia `World`/`EventBus`/`ResourceSystem`/`FlowRegistry`,
 *      e registra defaults (`ShadowFlow + ForwardFlow + PostFlow + UIFlow + DebugFlow`).
 *   2. `app.world.insert(entity)` para cada entidade da cena. Resources
 *      indexados disparam alocação de buffers/binds reativamente.
 *   3. `app.start()` inicia o `GameLoop` (RAF), que emite `frameTick` e cada
 *      Flow ready dispatcha seus passes dentro de `core.record(...)` + `submit()`.
 *   4. `app.stop()` pausa o RAF; `app.dispose()` desfaz event listeners.
 *
 * Resize: por padrão (`autoResize: true` em browser) anexa um listener em
 * `window.resize` debounced 100ms que reconfigura o canvas + emite
 * `canvasReconfigured`, e os flows recriam textures size-dependent via
 * `Flow.onCanvasResized`.
 */
export class Application {
    /** World ECS-like — query/insert/remove de Resources. Atalho para `scene.world`. */
    readonly world: World;
    /** FlowRegistry — registro de Flows ativos. Atalho para `scene.flows`. */
    readonly flows: FlowRegistry;
    /** Resource especial com `dt` e `elapsed` atualizados pelo GameLoop. */
    readonly time: Time;
    /**
     * Refs para os Flows default (Forward, Shadow, Post, UI, Debug). Útil
     * para customizar (e.g. `app.defaults.post.addEffect(new Bloom(...))`).
     */
    readonly defaults: PresentationDefaults;
    /** Canvas HTML attachado. Mesmo objeto passado em `create({canvas})`. */
    readonly canvas: HTMLCanvasElement;
    private readonly scene: SceneContext;
    private readonly ownsScene: boolean;
    private readonly loop: GameLoop;
    private readonly resizeDebounceMs: number;
    private resizeTimer: ReturnType<typeof setTimeout> | null = null;
    private resizeListener: (() => void) | null = null;

    private readonly memoryBudgetBytes: number | null = null;
    private memoryWarningEmitted = false;
    private memoryUnsubscribe: (() => void) | null = null;
    private readonly plugins: EnginePlugin[] = [];

    private constructor(
        options: ApplicationOptions,
        defaults: PresentationDefaults,
        scene: SceneContext,
        ownsScene: boolean,
    ) {
        this.canvas = options.canvas;
        this.scene = scene;
        this.ownsScene = ownsScene;
        this.world = scene.world;
        this.flows = scene.flows;
        this.time = new Time();
        this.defaults = defaults;
        this.loop = new GameLoop(scene.events, this.time);
        this.resizeDebounceMs = options.resizeDebounceMs ?? 100;
        scene.world.insert(this.time);

        const autoResize = options.autoResize ?? typeof window !== 'undefined';
        if (autoResize && typeof window !== 'undefined') {
            this.resizeListener = () => {
                this.scheduleResize();
            };
            window.addEventListener('resize', this.resizeListener);
        }

        if (options.memoryBudgetMB !== undefined) {
            this.memoryBudgetBytes = options.memoryBudgetMB * 1024 * 1024;
            this.memoryUnsubscribe = scene.events.on('frameComplete', () => {
                this.checkMemoryBudget();
            });
        }
    }

    private checkMemoryBudget(): void {
        if (this.memoryBudgetBytes === null) return;
        const usage = this.scene.core.memoryUsage();
        const above = usage.totalBytes > this.memoryBudgetBytes;
        if (above && !this.memoryWarningEmitted) {
            this.memoryWarningEmitted = true;
            this.scene.events.emit('memoryWarning', {
                totalBytes: usage.totalBytes,
                budgetBytes: this.memoryBudgetBytes,
                top: usage.top.map((e) =>
                    e.label !== undefined
                        ? { kind: e.kind, bytes: e.bytes, label: e.label }
                        : { kind: e.kind, bytes: e.bytes },
                ),
            });
        } else if (!above && this.memoryWarningEmitted) {
            // Reset histerese — próxima vez que cruzar threshold, emite de novo.
            this.memoryWarningEmitted = false;
        }
    }

    static async create(options: ApplicationOptions): Promise<Application> {
        const scene: SceneContext = options.scene ?? defaultScene;
        const ownsScene = options.scene !== undefined;
        if (options.canvasOptions !== undefined) {
            await scene.core.initialize(options.canvas, options.canvasOptions);
        } else {
            await scene.core.initialize(options.canvas);
        }
        const defaults = registerPresentationDefaults(scene.flows, {
            canvas: options.canvas,
            core: scene.core,
            world: scene.world,
            resources: scene.resourceSystem,
            events: scene.events,
        });
        if (options.captureErrors === true) {
            scene.executionSystem.captureErrors = true;
        }
        return new Application(options, defaults, scene, ownsScene);
    }

    /**
     * Instala um plugin. O `plugin.install(this)` roda imediatamente, então
     * pode registrar flows, eventos, etc. Múltiplos plugins instalados
     * serão `dispose()`-ados em ordem reversa quando `app.dispose()`.
     */
    use(plugin: EnginePlugin): this {
        plugin.install(this);
        this.plugins.push(plugin);
        return this;
    }

    /** Inicia o GameLoop (RAF). Chama isso após inserir entidades no World. */
    start(): void {
        this.loop.start();
    }

    /** Pausa o GameLoop (RAF). Reversível via `start()`. */
    stop(): void {
        this.loop.stop();
    }

    /** True se o GameLoop está ativo (RAF agendado). */
    isRunning(): boolean {
        return this.loop.isRunning();
    }

    /**
     * Recupera após `deviceLost`. Re-cria GPUDevice (via navigator.gpu) e
     * re-attacha o canvas. Ao final, emite `deviceRecovered` para que
     * sistemas reativos (ResourceSystem, Flows) reconstruam buffers/pipelines.
     *
     * Recomendado consumir via `app.events.on('deviceLost', () => app.requestNewDevice())`
     * — ou implementar política mais sofisticada (e.g. backoff, max retries).
     */
    async requestNewDevice(): Promise<void> {
        const reasonBefore: GPUDeviceLostReason = 'unknown';
        await this.scene.core.requestRecover(this.canvas);
        this.scene.events.emit('deviceRecovered', { reason: reasonBefore });
    }

    /**
     * Re-sincroniza canvas.width/height com clientWidth/clientHeight × DPR,
     * reconfigura o swapchain do core, e emite `canvasReconfigured` para
     * que Flows recriem suas textures size-dependent.
     */
    handleResize(): void {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const newW = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const newH = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
        if (this.canvas.width === newW && this.canvas.height === newH) return;
        this.canvas.width = newW;
        this.canvas.height = newH;
        this.scene.core.reconfigureCanvas();
        this.scene.events.emit('canvasReconfigured', {
            width: newW,
            height: newH,
            format: this.scene.core.canvasFormat,
        });
    }

    private scheduleResize(): void {
        if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            this.resizeTimer = null;
            this.handleResize();
        }, this.resizeDebounceMs);
    }

    /**
     * Para o loop, dispõe plugins (ordem reversa de instalação), remove
     * event listeners (resize, memory) e — se foi criada com `scene` próprio
     * — chama `scene.dispose()` para liberar GPU device.
     */
    dispose(): void {
        this.stop();
        // Plugins disposed em ordem reversa (último-registrado, primeiro-disposto).
        for (let i = this.plugins.length - 1; i >= 0; i--) {
            this.plugins[i]?.dispose?.(this);
        }
        this.plugins.length = 0;
        if (this.resizeTimer !== null) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        if (this.resizeListener !== null && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.resizeListener);
            this.resizeListener = null;
        }
        if (this.memoryUnsubscribe !== null) {
            this.memoryUnsubscribe();
            this.memoryUnsubscribe = null;
        }
        // Só dispose o scene se foi criado para esta Application (option scene).
        // Singleton default sobrevive entre Applications.
        if (this.ownsScene) this.scene.dispose();
    }

    /** Acesso direto à Camada 1 (EngineCore) para casos avançados. */
    get core(): EngineCore {
        return this.scene.core;
    }
    /** EventBus do scene — pub/sub tipado para todos os eventos da engine. */
    get events(): EventBus {
        return this.scene.events;
    }
    /** ResourceSystem — gerencia lifecycle de Resources e pools GPU. */
    get resources(): ResourceSystem {
        return this.scene.resourceSystem;
    }
    /** Registry de ConsumerResolvers — usado por LayoutInferencer. */
    get consumers(): ConsumerResolverRegistry {
        return this.scene.consumers;
    }
    /** LayoutInferencer — deriva bindings GPU a partir de WGSL parsed AST. */
    get layoutInferencer(): LayoutInferencer {
        return this.scene.layoutInferencer;
    }
    /** ExecutionSystem — orquestra dispatch de Flows por frameTick. */
    get executionSystem(): ExecutionSystem {
        return this.scene.executionSystem;
    }
}
