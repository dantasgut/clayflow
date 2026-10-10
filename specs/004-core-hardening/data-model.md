# Data Model: Endurecimento do núcleo

Entidades e regras desta feature. Decisões em [research.md](./research.md).

## Identidade de spec (C1)

| Campo / regra | Descrição                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `hash`        | `specHash(spec)` — UUIDv5 da serialização canônica; memorizado por referência (`WeakMap`)                    |
| serialização  | chaves ordenadas; spec aninhada → `{"$spec": hash(interna)}`; função → `{"$fn": id por referência}`          |
| imutabilidade | `create`/`createAsync` congelam a spec em profundidade (para em objetos já congelados; não entra em funções) |
| igualdade     | conteúdo igual ⇒ hash igual (dedup); objetos distintos de mesmo conteúdo compartilham o objeto de GPU        |

**Invariantes**: hash de uma spec nunca muda (spec congelada); a entrada some quando a spec é coletada.

## Entrada do store de GPU (C1)

| Campo                    | Descrição                                                   |
| ------------------------ | ----------------------------------------------------------- |
| `obj`                    | objeto de GPU                                               |
| `kind`, `bytes`, `label` | como hoje                                                   |
| `owners`                 | `Set<ResourceSpec>` — specs (objetos) que criaram a entrada |

**Transições**: `create(spec)` → `owners.add(spec)` (cria `obj` se a entrada não existe); `destroy(spec)` →
`owners.delete(spec)`; `owners` vazio → `obj.destroy()` e remoção. `shutdown`/device lost → limpa tudo.

## DeviceOptions / DeviceCapabilities (C1)

```ts
interface DeviceOptions {
  powerPreference?: 'low-power' | 'high-performance';
  requiredFeatures?: readonly GPUFeatureName[]; // ausente → erro na criação
  optionalFeatures?: readonly GPUFeatureName[]; // ausente → só no relatório
  requiredLimits?: Readonly<Record<string, number>>; // acima do máximo → máximo + registro
}

interface DeviceCapabilities {
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
  };
  powerPreference: 'low-power' | 'high-performance' | 'default';
  features: readonly GPUFeatureName[]; // obtidas
  missingFeatures: readonly GPUFeatureName[]; // desejadas (do motor ou do usuário) indisponíveis
  limits: Readonly<Record<string, number>>; // efetivos do device
  clampedLimits: readonly { name: string; requested: number; granted: number }[];
}
```

Limites que o motor eleva ao máximo do adaptador: `maxBufferSize`, `maxStorageBufferBindingSize`,
`maxStorageBuffersPerShaderStage`, `maxBindGroups`, `maxComputeWorkgroupStorageSize`,
`maxComputeInvocationsPerWorkgroup`. Feature opcional do motor: `timestamp-query`.

## Despacho linear (C1) e soma de prefixos (C3)

| Regra            | Descrição                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| grupos           | `g = ceil(count / workgroupSize)`                                                              |
| formato          | `x = min(g, maxComputeWorkgroupsPerDimension)`, `y = ceil(g / x)`, `z = 1`                     |
| índice no shader | `i = gid.x + gid.y · num_workgroups.x · workgroupSize`; `i ≥ count` retorna                    |
| scan — níveis    | `n_0` = células; `n_{l+1} = ceil(n_l / 256)` até `n_L ≤ 256`; `L` = níveis acima do 0          |
| scan — buffers   | um buffer de somas e um uniform de contagem por nível; recriados quando a grade muda           |
| scan — sequência | `scan_local` nos níveis 0..L−1 (subida), `scan_groups` no nível L, `scan_combine` de L−1 até 0 |

## Ritmo de quadros (C1/C4)

| Item                  | Regra                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `framesInFlight()`    | `submit` +1; `queue.onSubmittedWorkDone()` −1 (device perdido zera)                        |
| `maxFramesInFlight`   | `ApplicationOptions`, padrão 2, inteiro ≥ 1                                                |
| `GameLoop` tick       | avança só se `framesInFlight() < maxFramesInFlight`; senão pula sem mover a marca de tempo |
| `app.readyForFrame()` | `framesInFlight() < maxFramesInFlight`                                                     |
| `app.step()`          | não espera                                                                                 |

## Contatos do LCP (C3)

| Item            | Regra                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| capacidade `C`  | `min(N·M, N × maxContactsPerBody, ⌊maxStorageBufferBindingSize / 80⌋)`                               |
| contador        | `{ count, overflow }` (u32), zerado por `Frame.clear` antes da narrowphase de cada substep           |
| contato         | gravado em `atomicAdd(count)`; `col_idx` = id do par (`rb · totalCol + col`)                         |
| warm start      | hash `{ key, stamp, λn, λt1, λt2 }`, capacidade 2^k ≥ 2C, sondagem ≤ 32; lido se `stamp = atual − 1` |
| `contact_stamp` | contador de substeps, por região de parâmetros                                                       |
| acumulação      | `rb_contact_accumulate` (serial) → `body_contact[i] = (correção xyz, tem contato w)`                 |

## Time (C2 — `scene/time/Time.ts`)

| Campo              | Tipo           | Default | Regra                                                           |
| ------------------ | -------------- | ------- | --------------------------------------------------------------- |
| `realDt`           | s              | 0       | duração real do último quadro (limitada a `maxFrameDt`)         |
| `dt`               | s              | 0       | `realDt × scale`                                                |
| `elapsed`          | s              | 0       | soma de `dt`                                                    |
| `frame`            | inteiro        | 0       | +1 por `advance`                                                |
| `scale`            | ≥ 0            | 1       | 0 = pausado; mudança vale no próximo `advance`                  |
| `physicsScale`     | ≥ 0            | 1       | multiplicador só da física                                      |
| `fixedDt`          | s \| undefined | 1/60    | `undefined` = passo variável                                    |
| `maxStepsPerFrame` | inteiro ≥ 1    | 4       | teto de passos por quadro                                       |
| `maxFrameDt`       | s              | 0,25    | teto do `realDt`                                                |
| `accumulator`      | s              | 0       | resto para o próximo quadro, `0 ≤ acc < fixedDt` após `advance` |
| `steps`            | inteiro        | 0       | passos de física deste quadro                                   |
| `stepDt`           | s              | 0       | duração de cada passo deste quadro                              |
| `droppedTime`      | s              | 0       | tempo descartado acumulado pelo teto                            |

`advance(realDt)`:

```
realDt = min(realDt, maxFrameDt); dt = realDt·scale; elapsed += dt; frame += 1
physicsDt = dt·physicsScale
if fixedDt:
    accumulator += physicsDt
    steps = min(floor(accumulator / fixedDt), maxStepsPerFrame); stepDt = fixedDt
    accumulator -= steps·fixedDt
    if accumulator ≥ fixedDt: dropped = accumulator − (accumulator mod fixedDt); accumulator −= dropped
                              droppedTime += dropped; emit timeDropped { dropped }
else:
    steps = physicsDt > 0 ? 1 : 0; stepDt = physicsDt
```

`pause()`/`resume()` guardam e restauram `scale`; `pausePhysics()`/`resumePhysics()` idem para `physicsScale`. Um
`Time` por World, criado por `createScene`; `Application.time` aponta para ele. Uniform GPU `Time`
(`dt, elapsed, stepDt, steps`) continua disponível a shaders.

## Evento `frameTick` (C2)

`{ dt: number; realDt: number; elapsed: number; frame: number }` — emitido por `Application.step()` e pelo `GameLoop`,
sempre depois de `time.advance()`. Evento novo `timeDropped { dropped: number }`.

## Parâmetros por passo (Flows de física)

| Item                 | Regra                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| buffer de parâmetros | uniform com `capacity = maxStepsPerFrame × substeps` regiões de `align(stride, minUniformBufferOffsetAlignment)` |
| escrita              | uma por quadro, todas as regiões usadas (`steps × substeps`)                                                     |
| bind group           | layout com `hasDynamicOffset: true`; iteração `i` liga `[i × regionSize]`                                        |
| crescimento          | `maxStepsPerFrame` ou `substeps` maiores → recria buffer e bind group                                            |

## Alocação da C2

| Campo                                                 | Descrição                                |
| ----------------------------------------------------- | ---------------------------------------- |
| `allocations: Map<Resource, Map<descId, Allocation>>` | um registro por descritor                |
| `Allocation`                                          | `{ role, spec, view?, sampler?, bytes }` |

`ResourceDirectory extends PoolDirectory`: `bufferOf(resource, descId)`, `textureViewOf(resource, descId)`,
`samplerOf(resource, descId)` → spec ou `undefined`.

Layout de vértice compacto (`StructSchema.vertexLayout`): atributos na ordem declarada, sem alinhamento de struct
(`vec3f` = 12 bytes); `stride` = soma. Geometrias padrão: `position vec3f, normal vec3f, uv vec2f` → 32 bytes.

## Ciclo de vida (C2)

| Estado        | Transições válidas          | Mudança desta feature                   |
| ------------- | --------------------------- | --------------------------------------- |
| Uninitialized | Loading                     | —                                       |
| Loading       | Ready                       | —                                       |
| Ready         | Dirty, GpuManaged, Disposed | —                                       |
| Dirty         | Ready, Disposed             | —                                       |
| GpuManaged    | Ready, Disposed             | envio bloqueado por `suppressCpuUpload` |
| Disposed      | Destroyed                   | —                                       |
| Destroyed     | **Uninitialized**           | nova — permite reinserção após remoção  |

Toda atribuição de estado passa por `transition()`; transição inválida lança.

## World (C2)

| Regra                              | Comportamento                |
| ---------------------------------- | ---------------------------- |
| raiz já inserida                   | `insert` lança               |
| recurso já pertencente a raiz viva | `insert` lança               |
| recurso repetido na mesma árvore   | `insert` lança               |
| mapa recurso → entidade            | por World; limpo no `remove` |
| reinserção após `remove`           | permitida                    |

## Geometria

| Campo         | Regra                                                       |
| ------------- | ----------------------------------------------------------- |
| `indices`     | `Uint16Array` se `vertexCount ≤ 65535`, senão `Uint32Array` |
| `indexFormat` | derivado do array (`'uint16'` / `'uint32'`)                 |
