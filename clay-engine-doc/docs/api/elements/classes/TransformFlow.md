[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformFlow

# Class: TransformFlow

Defined in: [elements/scene/flows/TransformFlow.ts:109](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L109)

Estágio de transformação — produz, na GPU, a matriz de mundo e a matriz de normais de cada `Transform` a partir da
sua intenção (posição, rotação, escala), com a convenção `M = T · R · S`. O resultado fica no pool
`WorldTransform` (mesmo slot do `Transform`), que os estágios de sombra e desenho leem por índice de instância.

Slots: os pools `Transform` e `WorldTransform` (ligados por `consumes`) e as entidades com `Transform`. Reativo
pela tabela de transições: fica `stale` com `poolWritten` do pool `Transform`, entidades inseridas ou removidas,
pool realocado ou bind group substituído; em `stale`, `framePrepare` escreve a contagem (uma vez por quadro) e o
quadro grava a composição; `frameRecorded` volta a `clean` — numa cena parada não faz nada. Se o pool tem slots de
posse da GPU (a física publica a pose direto no `Transform`, spec 007), a composição roda todo quadro.

Hierarquia opcional (`Parent`, spec 007, research R12): a lista de elos (filho, pai) ordenada por nível é mantida
por eventos — refeita só quando o conjunto de filhos, os pais ou a posse da GPU mudam — e enviada numa escrita. O
quadro compõe todos os slots (nível 0) e depois cada nível ≥ 1 sobre o seu trecho da lista, com
`world = world[pai] · T · R · S`; cada nível lê o anterior já composto (passes em ordem). Sem nenhum `Parent`, um
único despacho, como antes. Ciclo, pai sem `Transform` e `Parent` em `Transform` de posse da GPU são erro; pai
removido torna o filho raiz com aviso.

Substituível: é o estágio padrão da fase `transform`. Registrar outro Flow nessa fase permite outras regras de
transformação — a base para a hierarquia opcional, para a função `transform` do usuário e para cadeias não
euclidianas do roadmap.

## Extends

- `Flow`\<[`TransformSlots`](../interfaces/TransformSlots.md), [`TransformState`](../type-aliases/TransformState.md)\>

## Constructors

### Constructor

> **new TransformFlow**(`ctx`): `TransformFlow`

Defined in: [elements/scene/flows/TransformFlow.ts:191](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L191)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`TransformFlow`

#### Overrides

`Flow<TransformSlots, TransformState>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `object`

Defined in: [elements/scene/flows/TransformFlow.ts:129](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L129)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### level

> `readonly` **level**: `ResolvedSource`

Trecho de cada nível (`TransformLevel`, uma região por nível, offset dinâmico).

#### links

> `readonly` **links**: `StorageBufferSpec`

Elos da hierarquia (`TransformLink`), ordenados por nível.

#### params

> `readonly` **params**: `UniformBufferSpec`

Parâmetros da composição (`TransformParams`: contagem).

#### transform\_fn\_group

> `readonly` **transform\_fn\_group**: `ResolvedSource`

Trecho e tempo de cada grupo de função (`TransformFnGroup`, uma região por grupo, offset dinâmico).

#### transform\_fn\_pairs

> `readonly` **transform\_fn\_pairs**: `StorageBufferSpec`

Pares (slot do Transform, slot do registro) das entidades com função, agrupados por função.

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"stale"`

Defined in: [elements/scene/flows/TransformFlow.ts:141](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L141)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [elements/scene/flows/TransformFlow.ts:112](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L112)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Overrides

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/scene/flows/TransformFlow.ts:113](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L113)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`TransformSlots`](../interfaces/TransformSlots.md)

Defined in: [elements/scene/flows/TransformFlow.ts:111](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L111)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<[`TransformState`](../type-aliases/TransformState.md), `TransitionContext`\<[`TransformSlots`](../interfaces/TransformSlots.md)\>\>

Defined in: [elements/scene/flows/TransformFlow.ts:142](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L142)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"TransformFlow"` = `'TransformFlow'`

Defined in: [elements/scene/flows/TransformFlow.ts:110](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L110)

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

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/scene/flows/TransformFlow.ts:303](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L303)

Grava a composição quando há intenção pendente (`stale`).

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`TransformSlots`](../interfaces/TransformSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/scene/flows/TransformFlow.ts:349](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/TransformFlow.ts#L349)

Libera o uniform de parâmetros, a lista de elos, as regiões dos níveis e as listas das funções.

#### Returns

`void`

#### Overrides

`Flow.dispose`
