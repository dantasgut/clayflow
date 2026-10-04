# Contrato — Observabilidade de quadro (API pública do motor, FR-007a)

Capacidade genérica do clayflow, útil a qualquer aplicação (overlay de debug, perfil de jogo) e usada pelo
harness. Desligada por padrão; contadores inteiros sempre ativos (custo desprezível).

## Superfície pública

```ts
// core/contracts/FrameStats.ts — exportado pelo barrel público
/** Estatísticas de um quadro, em vocabulário de domínio (sem tipos WebGPU). */
export interface FrameStats {
  /** Draw calls emitidos no quadro (diretos, indiretos e dentro de bundles executados). */
  readonly drawCalls: number;
  /** Dispatches de compute no quadro (diretos + indiretos). */
  readonly dispatches: number;
  /** Passes render + compute abertos no quadro. */
  readonly passes: number;
  /**
   * Tempo de GPU somado de todos os passes, em ms. Ausente quando o profiling está desligado,
   * o dispositivo não suporta timestamps, a capacidade estourou ou ainda não há leitura resolvida.
   * Chega com defasagem de 1–3 quadros; ver `gpuFrame`.
   */
  readonly gpuTimeMs?: number;
  /** Índice do quadro a que `gpuTimeMs` se refere. */
  readonly gpuFrame?: number;
}
```

```ts
// presentation/app/Application.ts
export interface ApplicationOptions {
  // …existentes…
  /**
   * Liga o profiling de GPU por quadro: todo passe recebe timestamps automaticamente e
   * `frameComplete.stats.gpuTimeMs` passa a ser preenchido. Default: false.
   */
  profiling?: boolean;
  /** Capacidade de timestamps por quadro (pares = passes medidos). Default: 256 (128 passes). */
  profilingCapacity?: number;
}
```

```ts
// scene/events/EventMap.ts
export interface FrameCompleteEvent {
  readonly timestamp: number; // existente
  readonly dt: number; // existente — CPU ms de record+submit
  readonly elapsed: number; // existente
  /** NOVO — estatísticas do quadro recém-submetido. */
  readonly stats: FrameStats;
}
```

```ts
// core/contracts/EngineCore.ts
interface EngineCore {
  // …existentes…
  /** Liga/desliga timestamps automáticos por passe. No-op sem `timestamp-query`. */
  setFrameProfiling(enabled: boolean, capacity?: number): void;
  /** Estatísticas do último quadro submetido. */
  lastFrameStats(): FrameStats;
}
```

## Comportamento

0. Criação do dispositivo (`core/gpu/GpuContext.ts`): `requiredFeatures` inclui `'timestamp-query'` quando o
   adaptador a oferece. Sem a feature, `setFrameProfiling(true)` é no-op com aviso único e `gpuTimeMs` fica
   ausente. (Configuração completa do dispositivo: spec `003-core-foundations`, F0.5.)
1. `record()` abre o quadro: zera contadores; se profiling ligado, `FrameTimestampAllocator.begin()`.
2. Cada `beginRenderPass`/`beginComputePass` sem `timestampWrites` explícito recebe um par do alocador. Passes com
   `timestampWrites` explícito (ex.: `ForwardFlow.setProfileTimestamps`) são respeitados e também somados.
3. Ao fim do quadro, `resolveQuerySet` + readback assíncrono (já existentes no `GpuProfilerSystem`); quando a
   leitura chega, `gpuTimeMs` = Σ intervalos válidos; fica disponível em `lastFrameStats()` e nos próximos
   `frameComplete`.
4. Estouro de capacidade: passes excedentes ficam sem timestamp, `gpuTimeMs` daquele quadro ausente, aviso único
   no console com a sugestão de `profilingCapacity`.
5. `DebugFlow` preenche `profilerStats.stagesNs` com `label do passe → ns` (corrige o vazio atual).

## Compatibilidade

- Aditivo: nenhum campo existente muda; `stats` é campo novo obrigatório no payload (consumidores existentes não
  são afetados). `ForwardFlow.setProfileTimestamps` continua funcionando.
- Backend substituível: um backend `mock` implementa `setFrameProfiling`/`lastFrameStats` trivialmente.

## Testes (Vitest, CPU-side)

- `createGpuContext`: com `navigator.gpu` mockado, solicita `timestamp-query` só quando o adaptador a oferece.

- Alocador: pares sequenciais, estouro, `begin` zera, soma ignora pares inválidos, todos inválidos → `undefined`.
- Contadores: mocks de encoder contam draw/drawIndexed/indirect/bundles/dispatch/dispatchIndirect e passes.
- `ExecutionSystem`: `frameComplete` carrega `stats` do core.
- `Application`: `profiling: true` chama `setFrameProfiling(true, capacity)`.
