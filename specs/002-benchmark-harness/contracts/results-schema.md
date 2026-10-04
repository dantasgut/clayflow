# Contrato — Resultados, baseline e relatório

## Arquivo de execução (`bench/results/*.json`)

```ts
export interface RunFile {
  readonly schemaVersion: 1;
  readonly profile: EnvironmentProfile;
  readonly config: RunConfig;
  readonly startedAt: string; // ISO 8601
  readonly durationMs: number;
  readonly results: readonly Result[];
}

export interface EnvironmentProfile {
  readonly profileId: string; // ex.: 'apple-m2-chrome141-macos-1280x720-3fa9c1'
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

export type ResultStatus = 'ok' | 'unsupported' | 'failed' | 'timeout';

export interface Metrics {
  readonly cpuMs: number; // mediana
  readonly gpuMs: number | null; // null = indisponível (nunca 0)
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
  readonly engine: 'clayflow' | 'three';
  readonly status: ResultStatus;
  readonly reason?: string; // obrigatório se status ≠ 'ok'
  readonly until?: string; // fase que deve habilitar (unsupported)
  readonly limitations?: readonly string[]; // limitações do motor declaradas pela cena (FR-007b)
  readonly metrics?: Metrics; // só se 'ok'
  readonly repetitions?: readonly Metrics[];
  readonly unstable?: boolean; // CV > 5%
}
```

## Baseline (`bench/baselines/<profileId>.json`, versionado)

```ts
export interface BaselineFile {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly createdAt: string;
  readonly commit: string;
  readonly tolerance: number;
  readonly results: readonly Result[]; // apenas engine === 'clayflow'
}
```

Métricas comparadas pelo gate: `cpuMs`, `gpuMs`, `frameMs.p95`, `frameMs.p99` (+ transições de status).

## Tabela markdown (`latest.md`)

Cabeçalho com o perfil (GPU, navegador, OS, resolução, commit, data) e uma linha por cena × variante:

```markdown
| Cena         | Variante | CPU ms (clay / three / ×)        | GPU ms (clay / three / ×) | FPS (clay / three) | p99 ms (clay / three) | Draw calls (clay / three) | Memória MB (clay / three\*) |
| ------------ | -------- | -------------------------------- | ------------------------- | ------------------ | --------------------- | ------------------------- | --------------------------- |
| instances    | 10k      | 4.10 / 0.42 / 9.8×               | 2.0 / 0.9 / 2.2×          | 210 / 1180         | 6.1 / 1.1             | 10000 / 1                 | 12.4 / 3.1\*                |
| point-lights | 256      | não suportado (até F3) / 1.2 / — | …                         | …                  | …                     | …                         | …                           |
```

`×` = clayflow ÷ Three (> 1 = clayflow mais lento). `*` = memória estimada. Linhas instáveis recebem ⚠ e `vsyncLimited`
recebe a nota "limitado pela vsync". Abaixo da tabela: resumo "mais rápido / equivalente (±10%) / mais lento"
por cena (SC-006), seguido da seção "Limitações conhecidas do motor" listando, por cena, as `limitations`
declaradas (FR-007b).
