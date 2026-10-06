/**
 * Contratos do harness de benchmark (spec 002 — contracts/scene-api.md e results-schema.md).
 * Lógica pura: nada aqui importa engine, navegador ou Node.
 */

/** Engines comparadas. */
export type EngineId = 'clayflow' | 'three';

/** Engines na ordem de execução e de relatório. */
export const ENGINES: readonly EngineId[] = ['clayflow', 'three'];

/** Câmera idêntica nas duas engines. */
export interface CameraSpec {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly fovDeg: number;
}

/** Variante de uma cena (ex.: contagem de objetos). */
export interface VariantDefinition {
    /** Identificador curto, único na cena (ex.: '10k'). */
    readonly id: string;
    /** Parâmetros livres da variante (ex.: `{ count: 10000, moving: true }`). */
    readonly params: Readonly<Record<string, number | string | boolean>>;
}

/** Declaração de não suporte de uma engine para uma cena. */
export interface Unsupported {
    /** Motivo em linguagem de domínio. */
    readonly unsupported: string;
    /** Fase do roadmap que deve habilitar (ex.: 'F4'). */
    readonly until?: string;
}

/** Contexto entregue a cada implementação de cena. */
export interface SceneContext<TEngine> {
    /** Handle da engine criado pelo adaptador. */
    readonly engine: TEngine;
    readonly variant: VariantDefinition;
    /** `mulberry32(seed)` — mesmo fluxo nas duas engines. */
    readonly rng: () => number;
    readonly camera: CameraSpec;
}

/** Implementação de uma cena para uma engine. */
export interface SceneImplementation<TEngine> {
    /**
     * Limitações conhecidas do motor que afetam o resultado desta implementação (FR-007b), em
     * linguagem de domínio. Aparecem no relatório ao lado da linha.
     */
    readonly limitations?: readonly string[];
    /** Monta o conteúdo. Pode ser assíncrono (compilação de pipelines, WASM). */
    setup(ctx: SceneContext<TEngine>): Promise<void> | void;
    /**
     * Trabalho por quadro além do render (ex.: passo de física CPU, mover objetos). No clayflow,
     * mover é mutar `transform.data` (reativo, spec 003): o envio acontece no início do quadro e
     * entra no `cpuMs`.
     */
    update?(dtSeconds: number): void;
}

/** Carregador lazy de uma implementação (a página só baixa o código da engine em uso). */
export type SceneLoader<TEngine> = () => Promise<SceneImplementation<TEngine>>;

/** Cena do catálogo. */
export interface SceneDefinition<TClay = unknown, TThree = unknown> {
    /** kebab-case, único no catálogo. */
    readonly id: string;
    readonly title: string;
    readonly description: string;
    /** Fase do roadmap que introduziu a cena ('F0'…). */
    readonly phase: string;
    readonly seed: number;
    readonly camera: CameraSpec;
    readonly variants: readonly VariantDefinition[];
    readonly implementations: {
        readonly clayflow: SceneLoader<TClay> | Unsupported;
        readonly three: SceneLoader<TThree> | Unsupported;
    };
}

/** Amostra de um quadro devolvida pelo adaptador. */
export interface FrameSample {
    readonly cpuMs: number;
    readonly drawCalls: number;
    /** Tempo de GPU da leitura mais recente, quando houver. */
    readonly gpuMs?: number;
    /** Identificador da leitura de GPU (para não contar a mesma leitura duas vezes). */
    readonly gpuSampleId?: number;
}

/** Adaptador de engine: monta, avança e desmonta uma cena. */
export interface EngineAdapter<THandle> {
    readonly id: EngineId;
    readonly version: string;
    /**
     * Limitações do motor que valem para toda cena desta engine (FR-007b) — somadas às da
     * implementação no resultado.
     */
    readonly limitations?: readonly string[];
    init(
        canvas: HTMLCanvasElement,
        resolution: { width: number; height: number },
        camera: CameraSpec,
    ): Promise<THandle>;
    capabilities(handle: THandle): {
        readonly gpuTiming: boolean;
        readonly memory: 'exact' | 'estimated';
    };
    /** Executa um quadro (update da cena + render) e devolve a amostra. */
    frame(handle: THandle, scene: SceneImplementation<THandle>, dtSeconds: number): FrameSample;
    memoryBytes(handle: THandle): number;
    /**
     * Leitura de GPU mais recente, consultada fora do quadro (para não perder a leitura que
     * chega depois do último quadro da janela). `id` distingue leituras.
     */
    gpuReading?(handle: THandle): { readonly gpuMs: number; readonly id: number } | undefined;
    dispose(handle: THandle): void;
}

/** `true` quando a implementação é uma declaração de não suporte. */
export function isUnsupported(impl: SceneLoader<unknown> | Unsupported): impl is Unsupported {
    return typeof impl !== 'function';
}

// ── Resultados ─────────────────────────────────────────────────────────────

export type ResultStatus = 'ok' | 'unsupported' | 'failed' | 'timeout';

export interface EnvironmentProfile {
    /** ex.: 'apple-m2-chrome141-macos-1280x720-3fa9c1'. */
    readonly profileId: string;
    readonly gpu: { vendor: string; architecture: string; device: string; description: string };
    readonly browser: { name: string; version: string; major: number };
    readonly os: string;
    readonly resolution: { width: number; height: number };
    readonly devicePixelRatio: number;
    readonly timestampQuery: boolean;
    readonly versions: { clayflow: string; three: string; rapier: string };
    readonly commit: string;
    readonly date: string;
}

export interface Metrics {
    /** Mediana. */
    readonly cpuMs: number;
    /** `null` = indisponível (nunca 0). */
    readonly gpuMs: number | null;
    readonly frameMs: { mean: number; p95: number; p99: number };
    readonly fps: number;
    readonly drawCalls: number;
    readonly memoryBytes: number;
    readonly memoryKind: 'exact' | 'estimated';
    readonly samples: { frames: number; gpu: number };
    readonly vsyncLimited: boolean;
}

export interface Result {
    readonly scene: string;
    readonly variant: string;
    readonly engine: EngineId;
    readonly status: ResultStatus;
    /** Obrigatório se `status ≠ 'ok'`. */
    readonly reason?: string;
    /** Fase que deve habilitar (unsupported). */
    readonly until?: string;
    /** Limitações do motor declaradas pela cena (FR-007b). */
    readonly limitations?: readonly string[];
    /** Só se 'ok'. */
    readonly metrics?: Metrics;
    readonly repetitions?: readonly Metrics[];
    /** CV > 5% entre repetições. */
    readonly unstable?: boolean;
}

export interface RunConfig {
    readonly warmupMs: number;
    readonly windowMs: number;
    readonly repetitions: number;
    readonly timeoutMs: number;
    readonly resolution: { width: number; height: number };
    readonly scenes: readonly string[];
    readonly variants: readonly string[];
    readonly engines: readonly EngineId[];
    readonly quick: boolean;
    readonly headless: boolean;
    readonly tolerance: number;
    readonly port: number;
    readonly from?: string;
    /** Liga o profiling de GPU do clayflow (default true; `false` mede o overhead — SC-005). */
    readonly profiling: boolean;
}

export interface RunFile {
    readonly schemaVersion: 1;
    readonly profile: EnvironmentProfile;
    readonly config: RunConfig;
    /** ISO 8601. */
    readonly startedAt: string;
    readonly durationMs: number;
    readonly results: readonly Result[];
}

export interface BaselineFile {
    readonly schemaVersion: 1;
    readonly profileId: string;
    readonly createdAt: string;
    readonly commit: string;
    readonly tolerance: number;
    /** Apenas engine === 'clayflow'. */
    readonly results: readonly Result[];
}

/** Métricas comparadas pelo gate. */
export type GateMetric = 'cpuMs' | 'gpuMs' | 'frameMs.p95' | 'frameMs.p99' | 'status';

export interface RegressionItem {
    readonly scene: string;
    readonly variant: string;
    readonly metric: GateMetric;
    readonly baseline: number | string;
    readonly current: number | string;
    /** Variação percentual (positivo = pior); `null` para transições de estado. */
    readonly deltaPct: number | null;
    /** Motivo de `skipped` (métrica indisponível, sem correspondência…). */
    readonly note?: string;
}

export interface RegressionReport {
    readonly profileId: string;
    readonly baselineCommit: string;
    readonly tolerance: number;
    readonly regressions: readonly RegressionItem[];
    readonly improvements: readonly RegressionItem[];
    readonly skipped: readonly RegressionItem[];
    readonly passed: boolean;
}

// ── Protocolo página → runner ──────────────────────────────────────────────

/** Amostras brutas de uma repetição, coletadas pela página. */
export interface RepetitionSamples {
    /** Intervalos entre quadros (ms). */
    readonly frameMs: readonly number[];
    readonly cpuMs: readonly number[];
    /** Leituras de GPU distintas (ms). */
    readonly gpuMs: readonly number[];
    readonly drawCalls: readonly number[];
    readonly memoryBytes: number;
    readonly memoryKind: 'exact' | 'estimated';
}

/** Ambiente visto pela página (vira parte do `EnvironmentProfile`). */
export interface PageEnvironment {
    readonly gpu: { vendor: string; architecture: string; device: string; description: string };
    readonly userAgent: string;
    readonly devicePixelRatio: number;
    readonly timestampQuery: boolean;
    /** Adaptador de software (SwiftShader) — números não representativos. */
    readonly isFallbackAdapter: boolean;
}

/** Resultado publicado pela página em `window.__benchResult`. */
export interface PageResult {
    readonly status: 'ok' | 'failed' | 'timeout';
    readonly reason?: string;
    readonly samples?: RepetitionSamples;
    readonly limitations?: readonly string[];
    readonly environment?: PageEnvironment;
    /** Versão da engine medida (`three.REVISION`, versão do clayflow). */
    readonly engineVersion?: string;
}
