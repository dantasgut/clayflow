[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DiffuseFlow

# Class: DiffuseFlow

Defined in: elements/particles/DiffuseFlow.ts:101

DiffuseFlow — partículas secundárias dos fluidos de partículas (spec 010; Ihmsen et al. 2012). Para cada
`DiffuseParticles`, depois do solver do fluido: a busca de vizinhos própria sobre o pool do fluido; normais de
superfície; potenciais (ar aprisionado, crista, energia cinética) e o número de partículas a gerar por partícula do
fluido; soma de prefixos e criação no anel em lugares determinísticos; depois, por passo fixo, a classificação pela
vizinhança e a dinâmica de spray, espuma e bolha, a colisão com os colliders e os vértices do desenho.

Usa o estado do fluido no fim do quadro (o solver roda os seus passos antes): a quantidade e o lugar das
partículas geradas dependem da taxa de quadros — detalhe visual, fora das trajetórias do fluido.

## Extends

- `Flow`\<[`DiffuseSlots`](../interfaces/DiffuseSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new DiffuseFlow**(`ctx`): `DiffuseFlow`

Defined in: elements/particles/DiffuseFlow.ts:114

#### Parameters

##### ctx

`FlowContext`

#### Returns

`DiffuseFlow`

#### Overrides

`Flow<DiffuseSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources` = `{}`

Defined in: [scene/flows/Flow.ts:67](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L67)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Inherited from

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: elements/particles/DiffuseFlow.ts:104

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`DiffuseSlots`](../interfaces/DiffuseSlots.md)

Defined in: elements/particles/DiffuseFlow.ts:103

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: elements/particles/DiffuseFlow.ts:105

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"DiffuseFlow"` = `'DiffuseFlow'`

Defined in: elements/particles/DiffuseFlow.ts:102

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: elements/particles/DiffuseFlow.ts:152

Geração uma vez por quadro e um passo de dinâmica por passo fixo, por entidade.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`DiffuseSlots`](../interfaces/DiffuseSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: elements/particles/DiffuseFlow.ts:192

Libera os recursos de cada entidade e o conjunto de colliders.

#### Returns

`void`

#### Overrides

`Flow.dispose`
