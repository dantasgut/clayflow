[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / CausticsFlow

# Class: CausticsFlow

Defined in: [presentation/flows/CausticsFlow.ts:64](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L64)

CausticsFlow — cáusticas da água por fótons em espaço da luz (spec 017, research R7), consumidor da superfície
genérica vista pela luz (`lightDepth`, `lightMaterial` do `WaterSurface`) — não sabe de partículas.

Na fase `shadow`, depois do mapa de sombra e do produtor da vista da luz: limpa os acumuladores, lança um fóton por
texel com água (refratado pela normal da superfície, até o receptor no mapa de sombra; energia de Fresnel × absorção
no percurso; depósito bilinear em ponto fixo) e resolve no mapa `caustics` — o fator de transmissão da luz que o
forward aplica abaixo da água. Só a luz que projeta sombra no render principal gera cáusticas; outras luzes com sombra
são avisadas uma vez.

## Extends

- `Flow`\<[`CausticsSlots`](../interfaces/CausticsSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new CausticsFlow**(`ctx`): `CausticsFlow`

Defined in: [presentation/flows/CausticsFlow.ts:83](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L83)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`CausticsFlow`

#### Overrides

`Flow<CausticsSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources` = `{}`

Defined in: [scene/flows/Flow.ts:67](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L67)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`DebugFlow`](DebugFlow.md).[`bindings`](DebugFlow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/CausticsFlow.ts:67](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L67)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`CausticsSlots`](../interfaces/CausticsSlots.md)

Defined in: [presentation/flows/CausticsFlow.ts:66](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L66)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [presentation/flows/CausticsFlow.ts:68](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L68)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"CausticsFlow"` = `'CausticsFlow'`

Defined in: [presentation/flows/CausticsFlow.ts:65](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L65)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [presentation/flows/CausticsFlow.ts:122](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L122)

Limpa, deposita e resolve.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`CausticsSlots`](../interfaces/CausticsSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/CausticsFlow.ts:143](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/CausticsFlow.ts#L143)

Libera kernels e parâmetros.

#### Returns

`void`

#### Overrides

`Flow.dispose`
