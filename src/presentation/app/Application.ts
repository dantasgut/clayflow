import { defaultScene } from '../../scene/index';
import type {
    CanvasOptions,
    DeviceCapabilities,
    DeviceOptions,
    EngineCore,
    SceneContext,
    EventBus,
    FlowRegistry,
    World,
} from '../../scene/index';
import type { ConsumerResolverRegistry } from '../../scene/consumers/ConsumerResolverRegistry';
import type { FrameProfilingGranularity } from '../../scene/contracts/gpu';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { LayoutInferencer } from '../../scene/systems/LayoutInferencer';
import type { ExecutionSystem } from '../../scene/systems/ExecutionSystem';
import { GameLoop } from './GameLoop';
import type { Time } from '../../scene/time/Time';
import {
    registerPresentationDefaults,
    releasePresentationDefaults,
    type PresentationDefaults,
} from '../flows/defaults';
import type { EnginePlugin } from '../plugins/EnginePlugin';
import type { Input } from '../input/Input';
import type { InteractionSystem } from '../input/InteractionSystem';
import { acquireSceneInteraction, releaseSceneInteraction } from './sceneInteraction';
import { ELEMENT_CONSUMERS } from '../../elements/consumers';

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
    /**
     * Preferências do device GPU: potência, features exigidas/desejadas e limites. Reaplicadas em
     * `requestNewDevice()`. O que foi obtido aparece em `app.capabilities`.
     */
    device?: DeviceOptions;
    /** Auto-attach window.resize listener (default true em ambiente browser). */
    autoResize?: boolean;
    /**
     * Antialiasing da geometria por MSAA (spec 008): 4 amostras por pixel nos alvos da cena, resolvidas antes do pós.
     * Default true. Vale para a cena (a primeira aplicação dela define).
     */
    antialias?: boolean;
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
    /**
     * Liga o profiling de GPU por quadro: `frameComplete.stats.gpuTimeMs` passa a ser preenchido (com defasagem de 1–3
     * quadros). `true` ou `'passes'`: todo passe recebe timestamps e `stagesNs` traz o tempo de cada um; `'frame'`:
     * só o total da gravação (dois timestamps por quadro, sem o custo de amostrar cada passe — o modo para medir
     * desempenho). Sem `timestamp-query` no device, avisa uma vez e segue sem tempo de GPU. Default: false.
     */
    profiling?: boolean | FrameProfilingGranularity;
    /** Capacidade de timestamps por quadro (pares = passes medidos). Default: 256 (128 passes). */
    profilingCapacity?: number;
    /**
     * Máximo de quadros em execução na GPU antes de o laço gravar outro (inteiro ≥ 1, default 2). Evita acumular
     * trabalho na GPU sem limite quando ela é mais lenta que a CPU; `step()` não espera.
     */
    maxFramesInFlight?: number;
    /**
     * Registra resolvers de `consumes` próprios da aplicação (ex.: `r.register(new SingletonResolver(Wind.schema,
     * 'wind'))`). Roda depois dos padrão do motor; `register` de um nome existente o substitui.
     */
    consumers?: (registry: ConsumerResolverRegistry) => void;
}

/**
 * Application — bootstrap das 4 camadas da engine sobre um `<canvas>`.
 *
 * Ciclo de vida:
 *   1. `await Application.create({ canvas })` adquire device/queue, configura
 *      swapchain, instancia `World`/`EventBus`/`ResourceSystem`/`FlowRegistry`,
 *      e registra por factory os estágios padrão (`TransformFlow`, `ShadowFlow`, `ForwardFlow`, `PostFlow`,
 *      `DebugFlow`, `UIFlow` e os solvers), inserindo os alvos do quadro (`FrameTargets`).
 *   2. `app.world.insert(entity)` para cada entidade da cena. Resources
 *      indexados disparam alocação de buffers/binds reativamente.
 *   3. `app.start()` inicia o `GameLoop` (RAF), que emite `frameTick`; cada Flow pronto (`flowReady`) grava os seus
 *      passes dentro de `core.record(...)` + `submit()`.
 *   4. `app.stop()` pausa o RAF; `app.dispose()` desfaz event listeners.
 *
 * Resize: por padrão (`autoResize: true` em browser) anexa um listener em
 * `window.resize` debounced 100ms que reconfigura o canvas + emite
 * `canvasReconfigured`: a C2 recria as texturas do tamanho do canvas e os Flows recriam os seus recursos privados
 * dependentes do tamanho numa transição.
 */
export class Application {
    /** World ECS-like — query/insert/remove de Resources. Atalho para `scene.world`. */
    readonly world: World;
    /** FlowRegistry — registro de Flows ativos. Atalho para `scene.flows`. */
    readonly flows: FlowRegistry;
    /**
     * Relógio da cena (o mesmo `Time` do World, compartilhado por todas as aplicações da cena): escala, pausa,
     * passo fixo da física. Avança a cada quadro do laço ou de `step()`.
     */
    readonly time: Time;
    /**
     * Refs para os Flows default (Forward, Shadow, Post, UI, Debug). Útil
     * para customizar (e.g. `app.defaults.post.addEffect(new Bloom(...))`).
     */
    readonly defaults: PresentationDefaults;
    /** Canvas HTML attachado. Mesmo objeto passado em `create({canvas})`. */
    readonly canvas: HTMLCanvasElement;
    /**
     * Entrada da cena (spec 007): Resource singleton no World — consulta (`isKeyDown`, `pointerDelta`, …) e eventos no
     * barramento (`keyDown`, `pointerMove`, `wheel`, …). Compartilhado pelas aplicações da mesma cena.
     */
    readonly input: Input;
    /** Liga os dispositivos ao `input` e tica os controllers da cena (componentes da entidade da câmera). */
    readonly interaction: InteractionSystem;
    private readonly scene: SceneContext;
    private readonly ownsScene: boolean;
    private readonly loop: GameLoop;
    private readonly maxFramesInFlight: number;
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
        this.time = scene.time;
        this.defaults = defaults;
        const interaction = acquireSceneInteraction(scene, options.canvas);
        this.input = interaction.input;
        this.interaction = interaction.system;
        this.maxFramesInFlight = options.maxFramesInFlight ?? 2;
        this.loop = new GameLoop(scene.events, this.time, () => this.readyForFrame());
        this.resizeDebounceMs = options.resizeDebounceMs ?? 100;

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

    /**
     * Construtor async — inicializa GPU device + canvas, registra os Flows
     * default + plugins (`options.plugins`), e retorna a `Application` pronta
     * para `start()`. Se `options.scene` é fornecido usa contexto isolado
     * (multi-Application); caso contrário usa o singleton default.
     */
    static async create(options: ApplicationOptions): Promise<Application> {
        const max = options.maxFramesInFlight;
        if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
            throw new RangeError(`maxFramesInFlight deve ser inteiro ≥ 1 (recebido ${max}).`);
        }
        const scene: SceneContext = options.scene ?? defaultScene;
        const ownsScene = options.scene !== undefined;
        await scene.initialize(options.canvas, options.canvasOptions, options.device);
        for (const resolver of ELEMENT_CONSUMERS) scene.consumers.registerDefault(resolver);
        options.consumers?.(scene.consumers);
        const defaults = registerPresentationDefaults(scene.flows, {
            world: scene.world,
            samples: options.antialias === false ? 1 : 4,
        });
        if (options.captureErrors === true) {
            scene.executionSystem.captureErrors = true;
        }
        if (options.profiling !== undefined && options.profiling !== false) {
            const granularity = options.profiling === true ? 'passes' : options.profiling;
            scene.core.setFrameProfiling(true, options.profilingCapacity, granularity);
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

    /** True se o GameLoop está ativo (RAF agendado ou esperando espaço na GPU). */
    isRunning(): boolean {
        return this.loop.isRunning();
    }

    /**
     * Avança `frames` quadros de `dt` segundos sem o laço (headless, testes, pré-cálculo, benchmark). Cada quadro
     * segue o mesmo caminho do `GameLoop`: `time.advance(dt)` e `frameTick` síncrono — `step(1/60, 300)` produz o
     * mesmo estado que 5 s de laço com `fixedDt` 1/60.
     *
     * @param dt Duração real de cada quadro (s). Default: `time.fixedDt ?? 1/60`.
     * @param frames Quantidade de quadros (inteiro ≥ 1). Default 1.
     * @throws Error se o laço está rodando; RangeError se `frames` é inválido.
     */
    step(dt: number = this.time.fixedDt ?? 1 / 60, frames = 1): void {
        if (this.loop.isRunning()) {
            throw new Error('Application.step(): o laço está rodando — chame stop() antes.');
        }
        if (!Number.isInteger(frames) || frames < 1) {
            throw new RangeError(
                `Application.step(): frames deve ser inteiro ≥ 1 (recebido ${frames}).`,
            );
        }
        for (let i = 0; i < frames; i++) this.loop.advance(dt);
    }

    /**
     * `true` quando a GPU tem espaço para mais um quadro (`framesInFlight < maxFramesInFlight`). O laço só grava
     * nesse caso; quem avança por `step()` (ex.: o benchmark) consulta para seguir o mesmo ritmo.
     */
    readyForFrame(): boolean {
        return this.scene.core.framesInFlight() < this.maxFramesInFlight;
    }

    /** Capacidades efetivas do device (adaptador, features, limites) — ver `DeviceCapabilities`. */
    get capabilities(): DeviceCapabilities {
        return this.scene.core.capabilities();
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
        releaseSceneInteraction(this.scene);
        // Estágios padrão: registrados uma vez por cena; a última aplicação da cena os desregistra.
        const lastUser = releasePresentationDefaults(this.scene.flows);
        // Cena passada em `options.scene` é descartada com a última aplicação que a usa; o singleton default
        // sobrevive entre aplicações.
        if (this.ownsScene && lastUser) this.scene.dispose();
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
