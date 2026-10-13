[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Input

# Class: Input

Defined in: [presentation/input/Input.ts:47](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L47)

Input — Resource singleton da cena (spec 007; uma instância por cena, inserida pela `Application`) que normaliza os
eventos do DOM e os expõe por duas APIs:

- **consulta** — estado a qualquer momento: `isKeyDown('KeyW')`, `isButtonDown('left')`, `pointerPosition()`,
  `pointerDelta()`, `wheelDelta()`, `gamepadAxis(pad, eixo)`, `gamepadButton(pad, botão)`;
- **push** — eventos no barramento da cena: `keyDown`/`keyUp`, `pointerDown`/`pointerUp`/`pointerMove`, `wheel`.

Não vai para a GPU (sem descritores); estágios o recebem por `slot.singleton(Input.schema)`. Os controllers de
câmera, componentes da entidade da câmera, o leem a cada quadro e mutam o `Transform`.

## Extends

- [`Entity`](../../elements/classes/Entity.md)\<`Record`\<`string`, `never`\>\>

## Implements

- `Resource`

## Constructors

### Constructor

> **new Input**(): `Input`

#### Returns

`Input`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### current

> `readonly` **current**: [`InputState`](../interfaces/InputState.md)

Defined in: [presentation/input/Input.ts:54](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L54)

Estado atual compartilhado — dispositivos escrevem, controllers leem (`state` é o do ciclo de vida).

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/input/Input.ts:51](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L51)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [presentation/input/Input.ts:49](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L49)

Marcador do Resource (não vai para a GPU).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L127)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`data`](../../elements/classes/Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`rawData`](../../elements/classes/Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`add`](../../elements/classes/Entity.md#add)

***

### consumeFrameDeltas()

> **consumeFrameDeltas**(): `void`

Defined in: [presentation/input/Input.ts:116](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L116)

Zera os deltas do quadro (chamado pelo `InteractionSystem` depois dos controllers).

#### Returns

`void`

***

### gamepadAxis()

> **gamepadAxis**(`pad`, `axis`): `number`

Defined in: [presentation/input/Input.ts:106](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L106)

Eixo de um gamepad (−1..1), ou 0 sem gamepad.

#### Parameters

##### pad

`number`

##### axis

`number`

#### Returns

`number`

***

### gamepadButton()

> **gamepadButton**(`pad`, `button`): `boolean`

Defined in: [presentation/input/Input.ts:111](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L111)

Botão de um gamepad pressionado.

#### Parameters

##### pad

`number`

##### button

`number`

#### Returns

`boolean`

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/input/Input.ts:123](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L123)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/input/Input.ts:127](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L127)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### isButtonDown()

> **isButtonDown**(`button`): `boolean`

Defined in: [presentation/input/Input.ts:71](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L71)

Botão do ponteiro pressionado agora.

#### Parameters

##### button

`"left"` \| `"middle"` \| `"right"`

#### Returns

`boolean`

***

### isKeyDown()

> **isKeyDown**(`code`): `boolean`

Defined in: [presentation/input/Input.ts:66](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L66)

Tecla pressionada agora (`KeyboardEvent.code`).

#### Parameters

##### code

`string`

#### Returns

`boolean`

***

### pinchDelta()

> **pinchDelta**(): `number`

Defined in: [presentation/input/Input.ts:101](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L101)

Variação da pinça (dois dedos) desde o último quadro.

#### Returns

`number`

***

### pointerDelta()

> **pointerDelta**(): `object`

Defined in: [presentation/input/Input.ts:86](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L86)

Deslocamento do ponteiro desde o último quadro.

#### Returns

##### dx

> `readonly` **dx**: `number`

Deslocamento horizontal acumulado no quadro, em pixels.

##### dy

> `readonly` **dy**: `number`

Deslocamento vertical acumulado no quadro, em pixels.

***

### pointerPosition()

> **pointerPosition**(): `object`

Defined in: [presentation/input/Input.ts:76](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L76)

Última posição do ponteiro em coordenadas do canvas.

#### Returns

##### x

> `readonly` **x**: `number`

Horizontal, em pixels do canvas.

##### y

> `readonly` **y**: `number`

Vertical, em pixels do canvas (para baixo).

***

### wheelDelta()

> **wheelDelta**(): `number`

Defined in: [presentation/input/Input.ts:96](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/Input.ts#L96)

Roda acumulada desde o último quadro.

#### Returns

`number`
