[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FluidSurfaceFlow

# Class: FluidSurfaceFlow

Defined in: [presentation/flows/FluidSurfaceFlow.ts:129](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L129)

FluidSurfaceFlow — produtor da superfície de água a partir das partículas (spec 017, research R2–R4 e R6): desenha os
corpos de partículas com `FluidSurfaceMaterial` como esferas lidas direto do pool do corpo (um desenho por corpo,
como os sprites da 008) e escreve a superfície genérica no `WaterSurface`:

  - vista `'camera'` (fase `forward`, depois dos opacos e dos sprites): profundidade linear e material da esfera mais
    próxima, espessura somada (cortada pela profundidade da cena) e a suavização bilateral separável;
  - vista `'light'` (fase `shadow`, depois do mapa de sombra): profundidade e material vistos pela luz que projeta
    sombra, suavizados — a entrada das cáusticas.

As texturas são alocadas sob demanda quando entra o primeiro corpo com água (sem água, nada é alocado nem gravado).
Os consumidores (`CausticsFlow`, `WaterFlow`) leem a superfície sem saber de partículas: a água por altura (spec 029)
escreve a mesma superfície.

## Extends

- `Flow`\<[`FluidSurfaceSlots`](../interfaces/FluidSurfaceSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new FluidSurfaceFlow**(`ctx`, `options?`): `FluidSurfaceFlow`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:182](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L182)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`FluidSurfaceFlowOptions`](../interfaces/FluidSurfaceFlowOptions.md) = `{}`

#### Returns

`FluidSurfaceFlow`

#### Overrides

`Flow<FluidSurfaceSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:132](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L132)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

[`DebugFlow`](DebugFlow.md).[`bindings`](DebugFlow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:133](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L133)

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

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`FluidSurfaceSlots`](../interfaces/FluidSurfaceSlots.md)

Defined in: [presentation/flows/FluidSurfaceFlow.ts:131](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L131)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [presentation/flows/FluidSurfaceFlow.ts:134](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L134)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"FluidSurfaceFlow"` = `'FluidSurfaceFlow'`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:130](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L130)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

***

### view

> `readonly` **view**: [`WaterView`](../type-aliases/WaterView.md)

Defined in: [presentation/flows/FluidSurfaceFlow.ts:137](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L137)

Vista produzida.

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

Defined in: [presentation/flows/FluidSurfaceFlow.ts:287](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L287)

Grava os passes das esferas e a suavização da vista.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`FluidSurfaceSlots`](../interfaces/FluidSurfaceSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:376](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L376)

Libera os recursos privados.

#### Returns

`void`

#### Overrides

`Flow.dispose`
