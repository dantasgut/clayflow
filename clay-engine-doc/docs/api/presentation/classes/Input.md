[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / Input

# Class: Input

Defined in: [src/presentation/input/Input.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L47)

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

- [`Resource`](../../platform/web/interfaces/Resource.md)

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

Defined in: [src/presentation/input/Input.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L55)

Estado atual compartilhado — dispositivos escrevem, controllers leem (`state` é o do ciclo de vida).

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/presentation/input/Input.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L52)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/presentation/input/Input.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L50)

Marcador do Resource (não vai para a GPU).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

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

Defined in: [src/scene/contracts/Entity.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L97)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [src/scene/contracts/Entity.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L103)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`data`](../../platform/web/interfaces/Resource.md#data)

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`data`](../../elements/classes/Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`rawData`](../../elements/classes/Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

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

Defined in: [src/presentation/input/Input.ts:125](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L125)

Zera os deltas do quadro (chamado pelo `InteractionSystem` depois dos controllers).

#### Returns

`void`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`detach`](../../elements/classes/Entity.md#detach)

***

### gamepadAxis()

> **gamepadAxis**(`pad`, `axis`): `number`

Defined in: [src/presentation/input/Input.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L107)

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

Defined in: [src/presentation/input/Input.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L112)

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

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/presentation/input/Input.ts:132](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L132)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/presentation/input/Input.ts:136](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L136)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

***

### isButtonDown()

> **isButtonDown**(`button`): `boolean`

Defined in: [src/presentation/input/Input.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L72)

Botão do ponteiro pressionado agora.

#### Parameters

##### button

`"left"` \| `"middle"` \| `"right"`

#### Returns

`boolean`

***

### isKeyDown()

> **isKeyDown**(`code`): `boolean`

Defined in: [src/presentation/input/Input.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L67)

Tecla pressionada agora (`KeyboardEvent.code`).

#### Parameters

##### code

`string`

#### Returns

`boolean`

***

### pinchDelta()

> **pinchDelta**(): `number`

Defined in: [src/presentation/input/Input.ts:102](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L102)

Variação da pinça (dois dedos) desde o último quadro.

#### Returns

`number`

***

### pointerDelta()

> **pointerDelta**(): `object`

Defined in: [src/presentation/input/Input.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L87)

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

Defined in: [src/presentation/input/Input.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L77)

Última posição do ponteiro em coordenadas do canvas.

#### Returns

##### x

> `readonly` **x**: `number`

Horizontal, em pixels do canvas.

##### y

> `readonly` **y**: `number`

Vertical, em pixels do canvas (para baixo).

***

### redescribe()

> `protected` **redescribe**(`previous`, `next`): `void`

Defined in: [src/scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L127)

Troca o dado e os descritores em pool de uma vez — o Resource cujo layout depende do próprio dado (ex.: o registro
tipado de uma função de ponto quando a forma dos parâmetros muda; spec 031, R8). `getDescriptors()` já devolve os
novos; `previous` são os de antes. Fora da cena, só troca o dado; na cena, a C2 libera os slots nos pools antigos,
ocupa os dos novos com `next` e recompõe a entidade (`entitiesRecomposed`: registros e conjuntos dos estágios).

#### Parameters

##### previous

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

##### next

`TData`

#### Returns

`void`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`redescribe`](../../elements/classes/Entity.md#redescribe)

***

### setGamepadSource()

> **setGamepadSource**(`source`): `void`

Defined in: [src/presentation/input/Input.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L120)

Quem lê os gamepads do ambiente (spec 038): o dispositivo de gamepad do ponto de entrada o registra ao ligar e
o tira ao desligar (`undefined`); sem ele, nenhum gamepad.

#### Parameters

##### source

[`GamepadSource`](../type-aliases/GamepadSource.md) \| `undefined`

#### Returns

`void`

***

### wheelDelta()

> **wheelDelta**(): `number`

Defined in: [src/presentation/input/Input.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/Input.ts#L97)

Roda acumulada desde o último quadro.

#### Returns

`number`
