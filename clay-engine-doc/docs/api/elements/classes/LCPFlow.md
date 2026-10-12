[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlow

# Class: LCPFlow

Defined in: [elements/physics/flows/LCPFlow.ts:174](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L174)

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

Ao fim do quadro, lê de volta o pool de corpos e publica a pose (posição e rotação) no `Transform` de cada
entidade; o mapa slot → entidade é capturado quando a cópia é gravada, então uma remoção entre a cópia e a leitura
não aplica a pose à entidade errada. A escala do `Transform` é do desenvolvedor e não é tocada. (O readback some na
F2, quando a física escrever a pose direto na GPU.)

## Extends

- `Flow`\<[`LCPSlots`](../interfaces/LCPSlots.md), `"running"`\>

## Constructors

### Constructor

> **new LCPFlow**(`ctx`, `options?`): `LCPFlow`

Defined in: [elements/physics/flows/LCPFlow.ts:220](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L220)

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

Defined in: [elements/physics/flows/LCPFlow.ts:178](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L178)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/LCPFlow.ts:179](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L179)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/LCPFlow.ts:177](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L177)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`LCPSlots`](../interfaces/LCPSlots.md)

Defined in: [elements/physics/flows/LCPFlow.ts:176](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L176)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`LCPSlots`](../interfaces/LCPSlots.md)\>\>

Defined in: [elements/physics/flows/LCPFlow.ts:180](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L180)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"LCPFlow"` = `'LCPFlow'`

Defined in: [elements/physics/flows/LCPFlow.ts:175](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L175)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### applyTransformsFromReadback()

> `protected` **applyTransformsFromReadback**(`ab`, `entities`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:733](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L733)

Publica a pose lida da GPU no `Transform` de cada corpo, pelo mapa slot → entidade capturado na cópia: só
posição e rotação (normalizada; nula ⇒ identidade). Entidade removida desde a cópia é ignorada; a escala não é
tocada.

#### Parameters

##### ab

`ArrayBuffer`

##### entities

readonly (`EntityId` \| `undefined`)[]

#### Returns

`void`

***

### contactCapacity()

> **contactCapacity**(`bodyCount`, `totalCol`): `number`

Defined in: [elements/physics/flows/LCPFlow.ts:341](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L341)

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

Defined in: [elements/physics/flows/LCPFlow.ts:355](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L355)

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

Defined in: [elements/physics/flows/LCPFlow.ts:438](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L438)

Libera parâmetros, contatos, buffers por corpo, staging e o conjunto de colliders.

#### Returns

`void`

#### Overrides

`Flow.dispose`

***

### reportContactOverflow()

> `protected` **reportContactOverflow**(`counter`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:716](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/flows/LCPFlow.ts#L716)

Avisa (uma vez) quando a narrowphase encontrou mais contatos que a capacidade da lista compactada.

#### Parameters

##### counter

`ArrayBuffer`

#### Returns

`void`
