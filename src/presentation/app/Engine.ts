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
import type {
    FrameProfilingGranularity,
    PlatformAdapter,
    PresentationSurface,
} from '../../scene/contracts/gpu';
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
import {
    acquireSceneInteraction,
    releaseSceneInteraction,
    type InputDevicesFactory,
} from './sceneInteraction';
import type { FrameScheduler } from './FrameScheduler';
import { ELEMENT_CONSUMERS } from '../../elements/consumers';
import type { AntialiasingMode } from '../../elements/scene/TemporalAntialiasing';

/**
 * Opções do motor (spec 038) comuns aos ambientes: o que o ponto de entrada (`clayflow/web`, `clayflow/deno`) não traz
 * por conta própria. Use `scene` para várias aplicações na mesma cena, `captureErrors`/`memoryBudgetMB` para
 * resiliência em produção.
 */
export interface EngineCommonOptions {
    /** Configuração da superfície de apresentação (alphaMode, colorSpace, formato, captura). Default: opaque/srgb. */
    canvasOptions?: CanvasOptions;
    /**
     * Preferências do device GPU: potência, features exigidas/desejadas e limites. Reaplicadas em
     * `requestNewDevice()`. O que foi obtido aparece em `app.capabilities`.
     */
    device?: DeviceOptions;
    /**
     * Antisserrilhado da cena (spec 034): `'temporal'` (padrão: a amostra deslocada dentro do pixel a cada quadro em
     * todos os passes, histórico reprojetado com rejeição), `'accumulate'` (média uniforme dos quadros desde o último
     * corte — imagem parada de referência), `'msaa'` (4 amostras por pixel só nas bordas da geometria, spec 008) ou
     * `'off'`. `true` vale `'temporal'` e `false`, `'off'`. Vale para a cena (a primeira aplicação dela define); o modo
     * muda depois por `defaults.antialiasing.mode` entre `temporal`, `accumulate` e `off` (o `msaa` só na criação).
     */
    antialias?: boolean | AntialiasingMode;
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
     * Registra fornecedores (`{ consumer }`) próprios da aplicação (ex.: `r.register(new SingletonResolver(Wind.schema,
     * 'wind'))`). Roda depois dos padrão do motor; `register` de um nome existente o substitui.
     */
    consumers?: (registry: ConsumerResolverRegistry) => void;
}

/**
 * Opções do `Engine` (spec 038): as comuns mais o que o ponto de entrada dá — o adaptador de plataforma (o adaptador da
 * GPU e o contexto), a superfície de apresentação, o agendador do laço e os dispositivos de entrada.
 */
export interface EngineOptions extends EngineCommonOptions {
    /** O adaptador de plataforma do ambiente (sem ele a criação falha, nomeando os pontos de entrada). */
    platform?: PlatformAdapter;
    /** A superfície de apresentação (sem ela, o motor roda sem tela: só computação e leituras). */
    surface?: PresentationSurface;
    /** O agendador do laço (`start`); sem ele, o motor avança só por `step()`. */
    scheduler?: FrameScheduler;
    /** Os dispositivos de entrada do ambiente (sem eles, o `Input` existe mas nada o alimenta). */
    inputDevices?: InputDevicesFactory;
}

/** O que a criação assíncrona prepara para o construtor. */
export interface PreparedEngine {
    readonly defaults: PresentationDefaults;
    readonly scene: SceneContext;
    readonly ownsScene: boolean;
}

/**
 * Engine — bootstrap das 4 camadas do motor sobre uma superfície de apresentação qualquer (spec 038: o núcleo, sem
 * ambiente). Os pontos de entrada a estendem: o `Application` do `clayflow/web` (o canvas, o redimensionamento, o DOM)
 * e o do `clayflow/deno` (a textura ou a janela).
 *
 * Ciclo de vida:
 *   1. `await Engine.create({ platform, surface })` (ou o `Application.create` do ponto de entrada) adquire o device,
 *      configura a superfície, instancia `World`/`EventBus`/`ResourceSystem`/`FlowRegistry` e registra por factory os
 *      estágios padrão (`TransformFlow`, `ShadowFlow`, `ForwardFlow`, `PostFlow`, `DebugFlow`, `UIFlow` e os solvers),
 *      inserindo os alvos do quadro (`FrameTargets`).
 *   2. `app.world.insert(entity)` para cada entidade da cena. Resources indexados disparam alocação de buffers/binds
 *      reativamente.
 *   3. `app.start()` inicia o `GameLoop` (pelo agendador do ambiente), que emite `frameTick`; cada Flow pronto
 *      (`flowReady`) grava os seus passes dentro de `core.record(...)` + `submit()`. Sem agendador, `step()`.
 *   4. `app.stop()` pausa o laço; `app.dispose()` desfaz o que foi ligado.
 *
 * Tamanho: quem muda a superfície (o ponto de entrada) chama `surfaceResized()`, que reconfigura a apresentação e emite
 * `canvasReconfigured`: a C2 recria as texturas do tamanho dela e os Flows os seus recursos privados.
 */
export class Engine {
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
    /** A superfície de apresentação (o canvas, a janela ou a textura; `undefined` sem tela). */
    readonly surface: PresentationSurface | undefined;
    /**
     * Entrada da cena (spec 007): Resource singleton no World — consulta (`isKeyDown`, `pointerDelta`, …) e eventos no
     * barramento (`keyDown`, `pointerMove`, `wheel`, …). Compartilhado pelas aplicações da mesma cena.
     */
    readonly input: Input;
    /** Liga os dispositivos ao `input` e tica os controllers da cena (componentes da entidade da câmera). */
    readonly interaction: InteractionSystem;
    protected readonly scene: SceneContext;
    private readonly ownsScene: boolean;
    private readonly loop: GameLoop;
    private readonly maxFramesInFlight: number;

    private readonly memoryBudgetBytes: number | null = null;
    private memoryWarningEmitted = false;
    private memoryUnsubscribe: (() => void) | null = null;
    private readonly plugins: EnginePlugin[] = [];

    protected constructor(options: EngineOptions, prepared: PreparedEngine) {
        const { defaults, scene, ownsScene } = prepared;
        this.surface = options.surface;
        this.scene = scene;
        this.ownsScene = ownsScene;
        this.world = scene.world;
        this.flows = scene.flows;
        this.time = scene.time;
        this.defaults = defaults;
        const interaction = acquireSceneInteraction(scene, options.inputDevices ?? (() => []));
        this.input = interaction.input;
        this.interaction = interaction.system;
        this.maxFramesInFlight = options.maxFramesInFlight ?? 2;
        this.loop = new GameLoop(
            scene.events,
            this.time,
            () => this.readyForFrame(),
            options.scheduler,
        );

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
     * Construtor async — inicializa o device pelo adaptador de plataforma e a superfície, registra os Flows padrão e
     * devolve o motor pronto para `start()`/`step()`. Se `options.scene` é fornecido usa contexto isolado (várias
     * aplicações); caso contrário usa o singleton default.
     */
    static async create(options: EngineOptions): Promise<Engine> {
        return new Engine(options, await Engine.prepareFor(options));
    }

    /** A parte assíncrona da criação (os pontos de entrada a usam antes de construir a subclasse). */
    protected static async prepareFor(options: EngineOptions): Promise<PreparedEngine> {
        const max = options.maxFramesInFlight;
        if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
            throw new RangeError(`maxFramesInFlight deve ser inteiro ≥ 1 (recebido ${max}).`);
        }
        const scene: SceneContext = options.scene ?? defaultScene;
        const ownsScene = options.scene !== undefined;
        // Desenho indireto com primeira instância (malha adaptativa das superfícies, spec 010): pedido quando o
        // adaptador tem; sem ela, a superfície adaptativa usa a grade de mesma precisão máxima.
        const device: DeviceOptions = {
            ...options.device,
            optionalFeatures: [
                ...(options.device?.optionalFeatures ?? []),
                'indirect-first-instance',
            ],
        };
        await scene.initialize(options.surface, options.canvasOptions, device, options.platform);
        for (const resolver of ELEMENT_CONSUMERS) scene.consumers.registerDefault(resolver);
        options.consumers?.(scene.consumers);
        const defaults = registerPresentationDefaults(scene.flows, {
            world: scene.world,
            events: scene.events,
            ...antialiasOf(options.antialias),
        });
        if (options.captureErrors === true) {
            scene.executionSystem.captureErrors = true;
        }
        if (options.profiling !== undefined && options.profiling !== false) {
            const granularity = options.profiling === true ? 'passes' : options.profiling;
            scene.core.setFrameProfiling(true, options.profilingCapacity, granularity);
        }
        return { defaults, scene, ownsScene };
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
            throw new Error(
                `${this.constructor.name}.step(): o laço está rodando — chame stop() antes.`,
            );
        }
        if (!Number.isInteger(frames) || frames < 1) {
            throw new RangeError(
                `${this.constructor.name}.step(): frames deve ser inteiro ≥ 1 (recebido ${frames}).`,
            );
        }
        for (let i = 0; i < frames; i++) this.loop.advance(dt);
    }

    /**
     * Espera o motor ficar pronto (spec 034): nenhum Flow ativo com pipeline sem fonte, em conferência, compilando ou
     * trocando, avaliado num quadro gravado depois desta chamada (o que acabou de ser inserido entra na conta). Com o
     * laço parado, avança quadros vazios (`step(0)`, sem tempo de simulação) cedendo ao navegador entre eles e só com
     * espaço na GPU (`readyForFrame`: os quadros em andamento abaixo do teto, como o laço); com o
     * laço rodando, só observa os quadros dele. O tempo da simulação nunca é tocado.
     *
     * @param options.timeoutMs Prazo (padrão 30 000 ms).
     * @throws Error ao vencer o prazo, listando o que ainda está pendente (Flow, pipeline, motivo, binding).
     */
    async whenReady(options: { readonly timeoutMs?: number } = {}): Promise<void> {
        const readiness = this.scene.resourceSystem.readiness;
        const deadline = performance.now() + (options.timeoutMs ?? 30_000);
        const start = readiness.evaluations;
        while (readiness.evaluations === start || readiness.state !== 'ready') {
            if (performance.now() > deadline) {
                const list = readiness.pending
                    .map(
                        (p) =>
                            `${p.flow}/${p.pipeline} (${p.reason}${p.name !== undefined ? `: ${p.name}` : ''})`,
                    )
                    .join(', ');
                throw new Error(
                    `${this.constructor.name}.whenReady(): o motor não ficou pronto no prazo — pendente: ${list || 'nenhum quadro gravado'}`,
                );
            }
            if (this.loop.isRunning()) {
                // Até o próximo quadro do laço, ou o prazo (o laço pode parar enquanto espera).
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(done, Math.max(0, deadline - performance.now()));
                    const off = this.scene.events.on('frameComplete', done);
                    function done(): void {
                        clearTimeout(timer);
                        off();
                        resolve();
                    }
                });
            } else {
                // Só grava com espaço na GPU (`readyForFrame`, como o laço): sem isso, a CPU empilha quadros mais rápido
                // que a GPU os termina — no Metal pelo wgpu (Deno), cada passe de compute ocupa buffers de comando e,
                // passado o teto do Metal, a criação do seguinte bloqueia para sempre (gfx-rs/wgpu#8047).
                if (this.readyForFrame()) this.step(0);
                await new Promise((r) => setTimeout(r, 16));
            }
        }
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
     * Recupera após `deviceLost`. Re-cria o GPUDevice (pelo adaptador de plataforma) e
     * re-attacha a superfície. Ao final, emite `deviceRecovered` para que
     * sistemas reativos (ResourceSystem, Flows) reconstruam buffers/pipelines.
     *
     * Recomendado consumir via `app.events.on('deviceLost', () => app.requestNewDevice())`
     * — ou implementar política mais sofisticada (e.g. backoff, max retries).
     */
    async requestNewDevice(): Promise<void> {
        const reasonBefore: GPUDeviceLostReason = 'unknown';
        await this.scene.core.requestRecover(this.surface);
        this.scene.events.emit('deviceRecovered', { reason: reasonBefore });
    }

    /**
     * A superfície mudou de tamanho (spec 038: o ponto de entrada avisa — o canvas redimensionado, a janela, a textura):
     * reconfigura a apresentação no core e emite `canvasReconfigured` para que os Flows recriem as texturas do tamanho
     * dela.
     */
    surfaceResized(): void {
        const size = this.scene.core.canvasSize();
        if (size === undefined) return;
        this.scene.core.reconfigureCanvas();
        this.scene.events.emit('canvasReconfigured', {
            width: size.width,
            height: size.height,
            format: this.scene.core.canvasFormat,
        });
    }

    /** O que o ponto de entrada desfaz no descarte (os ouvintes do ambiente), antes da cena. */
    protected disposeEnvironment(): void {}

    /**
     * Para o loop, dispõe plugins (ordem reversa de instalação), desfaz o que o ponto de entrada ligou (o
     * redimensionamento, os ouvintes do ambiente) e o aviso de memória e — se foi criada com `scene` próprio
     * — chama `scene.dispose()` para liberar GPU device.
     */
    dispose(): void {
        this.stop();
        // Plugins disposed em ordem reversa (último-registrado, primeiro-disposto).
        for (let i = this.plugins.length - 1; i >= 0; i--) {
            this.plugins[i]?.dispose?.(this);
        }
        this.plugins.length = 0;
        this.disposeEnvironment();
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

/** Modo do antisserrilhado e as amostras dos alvos da cena pela opção `antialias` (spec 034). */
function antialiasOf(option: boolean | AntialiasingMode | undefined): {
    samples: 1 | 4;
    antialiasing: AntialiasingMode;
} {
    const mode: AntialiasingMode =
        option === undefined || option === true ? 'temporal' : option === false ? 'off' : option;
    return { samples: mode === 'msaa' ? 4 : 1, antialiasing: mode };
}
