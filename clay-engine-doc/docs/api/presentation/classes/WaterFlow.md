[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / WaterFlow

# Class: WaterFlow

Defined in: [presentation/flows/WaterFlow.ts:72](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L72)

WaterFlow — composição óptica da água (spec 017, research R5), consumidor da superfície genérica do `WaterSurface`
(profundidade, espessura e material por pixel) — não sabe de onde ela vem (partículas hoje, água por altura na 029).

Na fase `forward`, depois do produtor da vista da câmera: copia a cor da cena para `background` (a fonte da refração,
que não pode ser a textura em que o passe resolve) e desenha um triângulo de tela cheia nos alvos da cena — com MSAA,
nas amostras, resolvidas na cor —, com teste de profundidade contra a cena (a água se oculta atrás dos objetos) sem
escrever nela. Por pixel: normal da profundidade suavizada, refração, absorção pela espessura, dispersão, Fresnel com
a cor de ambiente do material, especular e a sombra da cena. Só grava quando a superfície foi produzida no quadro.

## Extends

- `RenderFlow`\<[`WaterSlots`](../interfaces/WaterSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new WaterFlow**(`ctx`): `WaterFlow`

Defined in: [presentation/flows/WaterFlow.ts:95](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L95)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`WaterFlow`

#### Overrides

`RenderFlow<WaterSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [presentation/flows/WaterFlow.ts:75](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L75)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`RenderFlow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/WaterFlow.ts:76](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L76)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`RenderFlow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`RenderFlow.pipelines`

***

### slots

> `readonly` **slots**: [`WaterSlots`](../interfaces/WaterSlots.md)

Defined in: [presentation/flows/WaterFlow.ts:74](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L74)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [presentation/flows/WaterFlow.ts:77](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L77)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"WaterFlow"` = `'WaterFlow'`

Defined in: [presentation/flows/WaterFlow.ts:73](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L73)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`RenderFlow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`RenderFlow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`RenderFlow.state`

## Methods

### colorAttachment()

> `protected` **colorAttachment**(`frame`, `target`, `load`): `ColorAttachment` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:29](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/RenderFlow.ts#L29)

Anexo de cor do alvo (spec 008): com amostras (MSAA), desenha na textura de amostras — guardada, para um passe
seguinte carregar — e resolve na cor; sem elas, desenha direto na cor. `undefined` sem cor.

#### Parameters

##### frame

`Frame`

##### target

`BoundTarget`

##### load

\{ `loadOp`: `"load"`; \} \| \{ `clearValue`: readonly \[`number`, `number`, `number`, `number`\]; `loadOp`: `"clear"`; \}

#### Returns

`ColorAttachment` \| `undefined`

#### Inherited from

`RenderFlow.colorAttachment`

***

### colorView()

> `protected` **colorView**(`frame`, `target`): `TextureViewSpec` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/RenderFlow.ts#L20)

View de cor do alvo resolvido neste quadro (`frame.canvasView` para o canvas; `undefined` sem cor).

#### Parameters

##### frame

`Frame`

##### target

`BoundTarget`

#### Returns

`TextureViewSpec` \| `undefined`

#### Inherited from

`RenderFlow.colorView`

***

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [presentation/flows/WaterFlow.ts:180](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L180)

Copia a cena para `background` e compõe a água sobre ela.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`WaterSlots`](../interfaces/WaterSlots.md)\>

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/WaterFlow.ts:211](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/WaterFlow.ts#L211)

Libera os recursos privados.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`
