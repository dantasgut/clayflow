[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlow

# Class: LCPFlow

Defined in: [elements/physics/flows/LCPFlow.ts:209](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L209)

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
collider. Recursos privados — parâmetros por iteração, lista de contatos e tabela de warm start (pela capacidade),
buffers por corpo, parâmetros de narrowphase por forma e o `ColliderSet` — são recriados e religados em transições
(`framePrepare`, pools realocados, colliders), nunca no `dispatch`.

Ao fim do quadro, `rb_publish_pose` copia na GPU a pose (posição e rotação normalizada) de cada corpo para o
`Transform` da entidade (registro `RigidPose` mantido pela C2; o `Transform` é de posse da GPU), e o estágio de
transformação compõe a matriz no mesmo quadro — nenhuma leitura de volta (spec 007). A escala do `Transform` é do
desenvolvedor e não é tocada. Quem precisa da pose na CPU usa a leitura sob demanda da C2. O contador de excedente
de contatos é lido a cada `OVERFLOW_CHECK_STEPS` passos, sem bloquear.

## Extends

- `Flow`\<[`LCPSlots`](../interfaces/LCPSlots.md), `"running"`\>

## Constructors

### Constructor

> **new LCPFlow**(`ctx`, `options?`): `LCPFlow`

Defined in: [elements/physics/flows/LCPFlow.ts:273](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L273)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`LCPFlowOptions`](../interfaces/LCPFlowOptions.md) = `{}`

#### Returns

`LCPFlow`

#### Overrides

`Flow<LCPSlots, 'running'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [elements/physics/flows/LCPFlow.ts:213](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L213)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/LCPFlow.ts:214](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L214)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/LCPFlow.ts:212](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L212)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`LCPSlots`](../interfaces/LCPSlots.md)

Defined in: [elements/physics/flows/LCPFlow.ts:211](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L211)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`LCPSlots`](../interfaces/LCPSlots.md)\>\>

Defined in: [elements/physics/flows/LCPFlow.ts:215](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L215)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"LCPFlow"` = `'LCPFlow'`

Defined in: [elements/physics/flows/LCPFlow.ts:210](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L210)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### contactBuffers()

> **contactBuffers**(): `object`

Defined in: [elements/physics/flows/LCPFlow.ts:460](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L460)

Lista compactada de contatos do último substep gravado, o seu contador `{ count, overflow }` e as contagens de
pares candidatos da broadphase (diagnóstico: smokes comparam o conjunto de contatos entre versões da narrowphase
e medem os pares testados). `contacts` é `null` até o
primeiro quadro com corpos.

#### Returns

##### capacity

> `readonly` **capacity**: `number`

Contatos que cabem no buffer.

##### contacts

> `readonly` **contacts**: `StorageBufferSpec` \| `null`

Contatos do último substep (`RBContact`), ou `null` antes da primeira alocação.

##### counter

> `readonly` **counter**: `StorageBufferSpec`

Contador de contatos reservados (`AtomicAllocCounter`).

##### pairCounts

> `readonly` **pairCounts**: `StorageBufferSpec`

Contagens de pares candidatos do último substep (`CandidatePairCounts`: caixas, esferas, excedente).

##### recordBytes

> `readonly` **recordBytes**: `number`

Bytes por contato (stride do struct `RBContact`).

***

### contactCapacity()

> **contactCapacity**(`bodyCount`, `totalCol`): `number`

Defined in: [elements/physics/flows/LCPFlow.ts:485](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L485)

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

Defined in: [elements/physics/flows/LCPFlow.ts:499](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L499)

Grava os passos do quadro (contagens, carimbos e capacidades decididos em `framePrepare`).

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`LCPSlots`](../interfaces/LCPSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:636](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L636)

Libera parâmetros, contatos, buffers por corpo, staging e o conjunto de colliders.

#### Returns

`void`

#### Overrides

`Flow.dispose`

***

### reportContactOverflow()

> `protected` **reportContactOverflow**(`counter`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:1046](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L1046)

Avisa (uma vez) quando a narrowphase encontrou mais contatos que a capacidade da lista compactada.

#### Parameters

##### counter

`ArrayBuffer`

#### Returns

`void`

***

### reportPairOverflow()

> `protected` **reportPairOverflow**(`counts`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:1034](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/LCPFlow.ts#L1034)

Avisa (uma vez) quando a broadphase encontrou mais pares candidatos que a capacidade das listas.

#### Parameters

##### counts

`ArrayBuffer`

#### Returns

`void`
