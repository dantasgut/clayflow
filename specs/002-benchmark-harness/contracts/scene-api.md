# Contrato — Cena e adaptador de engine (FR-015, US3)

Adicionar uma cena = criar `bench/scenes/<id>/` com a definição e uma implementação por engine (ou declarar não
suporte) e registrar no catálogo. Executor, métricas, relatório e baseline não mudam (SC-004).

```ts
// bench/core/types.ts
export type EngineId = 'clayflow' | 'three';

export interface CameraSpec {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDeg: number;
}

export interface VariantDefinition {
  readonly id: string; // ex.: '10k'
  readonly params: Readonly<Record<string, number | string | boolean>>;
}

export interface Unsupported {
  readonly unsupported: string; // motivo em linguagem de domínio
  readonly until?: string; // fase do roadmap que deve habilitar (ex.: 'F4')
}

/** Contexto entregue a cada implementação de cena. */
export interface SceneContext<TEngine> {
  readonly engine: TEngine; // handle da engine criado pelo adaptador
  readonly variant: VariantDefinition;
  readonly rng: () => number; // mulberry32(seed) — mesmo fluxo nas duas engines
  readonly camera: CameraSpec;
}

/** Implementação de uma cena para uma engine. */
export interface SceneImplementation<TEngine> {
  /**
   * Limitações conhecidas do motor que afetam o resultado desta implementação (FR-007b), em linguagem de
   * domínio. Aparecem no relatório ao lado da linha; somem quando a fase que as resolve for entregue.
   */
  readonly limitations?: readonly string[];
  /** Monta o conteúdo. Pode ser assíncrono (compilação de pipelines, WASM). */
  setup(ctx: SceneContext<TEngine>): Promise<void> | void;
  /**
   * Trabalho por quadro além do render (ex.: passo de física CPU, mover objetos). Opcional. No clayflow, mover é
   * mutar `transform.data` (reativo, spec 003): o envio acontece no início do quadro e entra no `cpuMs`.
   */
  update?(dtSeconds: number): void;
}

export interface SceneDefinition {
  readonly id: string; // kebab-case, único
  readonly title: string;
  readonly description: string;
  readonly phase: string; // fase que introduziu ('F0')
  readonly seed: number;
  readonly camera: CameraSpec;
  readonly variants: readonly VariantDefinition[];
  readonly implementations: {
    readonly clayflow: (() => Promise<SceneImplementation<ClayflowHandle>>) | Unsupported;
    readonly three: (() => Promise<SceneImplementation<ThreeHandle>>) | Unsupported;
  };
}

export interface FrameSample {
  readonly cpuMs: number;
  readonly drawCalls: number;
  readonly gpuMs?: number;
}

export interface EngineAdapter<THandle> {
  readonly id: EngineId;
  readonly version: string;
  init(canvas: HTMLCanvasElement, resolution: { width: number; height: number }): Promise<THandle>;
  capabilities(): { readonly gpuTiming: boolean; readonly memory: 'exact' | 'estimated' };
  /** Executa um quadro (update da cena + render) e devolve a amostra. */
  frame(handle: THandle, scene: SceneImplementation<THandle>, dtSeconds: number): FrameSample;
  memoryBytes(handle: THandle): number;
  dispose(handle: THandle): void;
}
```

Implementações são **lazy** (`() => import(...)`): a página só carrega o código (e o Three/Rapier) da engine
em uso — o lado clayflow nunca baixa Three.

## Catálogo inicial

| id                   | Variantes                                                                        | clayflow                                                                                                                                                                                                                                              | three                                                                                 |
| -------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `instances`          | `10k`, `100k`, `1m` (`count`, estáticas); `10k-moving` (`count`, `moving: true`) | N entidades Box+StandardMaterial+Transform (só `position`/`rotation`/`scale`); `10k-moving` muta posição/rotação de todas em `update` — limitações: sem instancing, 1 draw e 4 bind groups por objeto (até F2); um envio por objeto alterado (até F2) | `InstancedMesh`; `10k-moving` = `setMatrixAt` em todas + `instanceMatrix.needsUpdate` |
| `unique-objects`     | `1k`                                                                             | 1k geometrias com parâmetros distintos (segmentos/dimensões) e materiais distintos                                                                                                                                                                    | 1k `Mesh` com geometria e `MeshStandardMaterial` próprios                             |
| `point-lights`       | `256`                                                                            | `{ unsupported: 'forward ignora PointLight', until: 'F4' }`                                                                                                                                                                                           | 256 `PointLight` sobre plano + 200 objetos                                            |
| `skinned-characters` | `500`                                                                            | `{ unsupported: 'sem skinning/animação', until: 'F8' }`                                                                                                                                                                                               | 500 `SkinnedMesh` procedurais (20 ossos) + `AnimationMixer`                           |
| `rigid-bodies`       | `1k`, `10k`                                                                      | N `RigidBody` esfera (fachada de domínio) + chão — limitações: readback por quadro com pose publicada fora do quadro e 1 quadro de atraso (até F2), solver em uma thread (até F5)                                                                     | Rapier N esferas + chão; render `InstancedMesh`                                       |

## Regras

- Conteúdo derivado **só** de `rng` e `variant.params` (determinismo, FR-003). Movimento por quadro é função
  determinística do índice do objeto e do tempo simulado (`dtSeconds` acumulado), igual nas duas engines.
- Posicionar/mover no clayflow é só escrever em `transform.data` — sem matriz montada na cena, sem
  `emit('resourceDirty')` manual (spec 003).
- O lado clayflow importa apenas de `clayflow` (barrel público) — ESLint bloqueia o resto (FR-016).
- Cada engine usa a melhor abordagem idiomática pública para a mesma carga (research R8).
- Limitações do motor que pesam no resultado são declaradas em `limitations` (FR-007b) — nunca contornadas com
  acesso a internos.
