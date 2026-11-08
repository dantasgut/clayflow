[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LCPFlow

# Class: LCPFlow

Defined in: [src/elements/physics/flows/LCPFlow.ts:242](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L242)

LCPFlow — solver de RigidBody via LCP (Linear Complementarity Problem) com 4 fases canônicas: DetectContacts →
AssembleA → SolvePGS×K → Apply. O quadro executa `time.steps` passos de `time.stepDt`; cada passo faz predict,
`substeps` iterações de detecção + solve e commit, cada iteração com a sua região de parâmetros
(`PerStepUniforms`, offset dinâmico). Etapas:

  1. `rb_predict`        — integra gravidade + damping em `pos_pred`/`rot_pred`/`vel`
  2. narrowphase × N     — uma variante por pool de Collider (Plane/Box/Sphere/Mesh)
  3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato (massas divididas)
  4. `rb_solve_lcp`      — warm start + K iterações Jacobi com divisão de massa, paralelas por contato e por
                           corpo (research R19)
  5. `rb_contact_accumulate` + `rb_lcp_commit` — correção posicional por corpo; velocidades e pose

Modelo de slots: o pool de corpos, o `Time`, o `GravityField` (opcional), os pools de collider e as entidades com
collider. O espaço de trabalho — parâmetros por iteração, lista de contatos e tabela de warm start (pela capacidade),
buffers por corpo, broadphase, parâmetros de narrowphase por forma e o `ColliderSet` — é do Resource de trabalho
(`LCPWork`, spec 039): redimensionado e religado em transições (`framePrepare`, pools realocados, colliders), nunca no
`dispatch`. Os proxies da broadphase (caixas seguidas das esferas, de dois pools de collider) ficam no trabalho pela
capacidade: não são de um pool só, então não cabem como descritor de uma entidade.

Ao fim do quadro, `rb_publish_pose` copia na GPU a pose (posição e rotação normalizada) de cada corpo para o
`Transform` da entidade (registro `RigidPose` mantido pela C2; o `Transform` é de posse da GPU), e o estágio de
transformação compõe a matriz no mesmo quadro — nenhuma leitura de volta (spec 007). A escala do `Transform` é do
desenvolvedor e não é tocada. Quem precisa da pose na CPU usa a leitura sob demanda da C2. O contador de excedente
de contatos é lido a cada `OVERFLOW_CHECK_STEPS` passos pela leitura sob demanda da C2, sem bloquear.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`LCPSlots`](../interfaces/LCPSlots.md), `"running"`\>

## Constructors

### Constructor

> **new LCPFlow**(`ctx`, `options?`): `LCPFlow`

Defined in: [src/elements/physics/flows/LCPFlow.ts:290](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L290)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

##### options?

[`LCPFlowOptions`](../interfaces/LCPFlowOptions.md) = `{}`

#### Returns

`LCPFlow`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`constructor`](../../platform/web/classes/Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../../platform/web/type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`bindings`](../../platform/web/classes/Flow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [src/elements/physics/flows/LCPFlow.ts:246](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L246)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: readonly [`Listened`](../../platform/web/type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/flows/LCPFlow.ts:245](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L245)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`LCPSlots`](../interfaces/LCPSlots.md)

Defined in: [src/elements/physics/flows/LCPFlow.ts:244](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L244)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"running"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`LCPSlots`](../interfaces/LCPSlots.md)\>\>

Defined in: [src/elements/physics/flows/LCPFlow.ts:247](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L247)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"LCPFlow"` = `'LCPFlow'`

Defined in: [src/elements/physics/flows/LCPFlow.ts:243](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L243)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`type`](../../platform/web/classes/RenderFlow.md#type)

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`lifecycle`](../../platform/web/classes/Flow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`state`](../../platform/web/classes/Flow.md#state)

## Methods

### contactBuffers()

> **contactBuffers**(): `object`

Defined in: [src/elements/physics/flows/LCPFlow.ts:551](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L551)

#### Returns

##### capacity

> `readonly` **capacity**: `number`

Contatos que cabem no buffer.

##### contacts

> `readonly` **contacts**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md) \| `null`

Contatos do último substep (`RBContact`), ou `null` antes da primeira alocação.

##### counter

> `readonly` **counter**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Contador de contatos reservados (`AtomicAllocCounter`).

##### pairCounts

> `readonly` **pairCounts**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Contagens de pares candidatos do último substep (`CandidatePairCounts`: caixas, esferas, excedente).

##### recordBytes

> `readonly` **recordBytes**: `number`

Bytes por contato (stride do struct `RBContact`).

***

### contactCapacity()

> **contactCapacity**(`bodyCount`, `totalCol`): `number`

Defined in: [src/elements/physics/flows/LCPFlow.ts:579](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L579)

Capacidade da lista compactada de contatos (research R19): no máximo 8 contatos por par (cantos),
`maxContactsPerBody` por corpo e o que cabe num binding de storage do device.

#### Parameters

##### bodyCount

`number`

##### totalCol

`number`

#### Returns

`number`

***

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [src/elements/physics/flows/LCPFlow.ts:593](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L593)

Grava os passos do quadro (contagens, carimbos e capacidades decididos em `framePrepare`).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`LCPSlots`](../interfaces/LCPSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/physics/flows/LCPFlow.ts:735](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L735)

Libera os kernels da grade hash (os buffers são do `LCPWork` e saem da cena com ele).

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)

***

### reportContactOverflow()

> `protected` **reportContactOverflow**(`count`, `overflow`): `void`

Defined in: [src/elements/physics/flows/LCPFlow.ts:1105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L1105)

Avisa (uma vez) quando a narrowphase encontrou mais contatos que a capacidade da lista compactada.

#### Parameters

##### count

`number`

##### overflow

`number`

#### Returns

`void`

***

### reportPairOverflow()

> `protected` **reportPairOverflow**(`overflow`): `void`

Defined in: [src/elements/physics/flows/LCPFlow.ts:1095](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L1095)

Avisa (uma vez) quando a broadphase encontrou mais pares candidatos que a capacidade das listas.

#### Parameters

##### overflow

`number`

#### Returns

`void`
