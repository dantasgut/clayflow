# Class: WebGPURenderer

Defined in: [presentation/renderers/WebGPURenderer.ts:32](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/presentation/renderers/WebGPURenderer.ts#L32)

O Renderizador Final WebGPU (Camada 4).
Orquestra o Carregador (C2->C1), o Extrator (C2->C4) e usa a Camada 1 para despachar Comandos.

Layout de bind groups padrão (std_pipeline_hash):
  @group(0) — frame globals : viewProj matrix (64 bytes)
  @group(1) — per-object    : model matrix    (64 bytes, dynamic offset, stride 256 bytes)
  @group(2) — material      : color/roughness (criado em Material.allocateResource)

## Implements

- [`Renderer`](../interfaces/Renderer.md)

## Constructors

### Constructor

> **new WebGPURenderer**(`world?`): `WebGPURenderer`

Defined in: [presentation/renderers/WebGPURenderer.ts:96](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/presentation/renderers/WebGPURenderer.ts#L96)

#### Parameters

##### world?

[`SimulationWorld`](../interfaces/SimulationWorld.md)

#### Returns

`WebGPURenderer`

## Methods

### initialize()

> **initialize**(`canvas`): `Promise`\<`void`\>

Defined in: [presentation/renderers/WebGPURenderer.ts:117](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/presentation/renderers/WebGPURenderer.ts#L117)

Inicializa o backend WebGPU e adquire o device da GPU.
Deve ser chamado uma vez antes de render().
Toda a Camada 1 (device, queue, context) é gerenciada aqui — invisível ao usuário.

#### Parameters

##### canvas

`HTMLCanvasElement`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Renderer`](../interfaces/Renderer.md).[`initialize`](../interfaces/Renderer.md#initialize)

***

### render()

> **render**(`scene`, `camera`): `Promise`\<`void`\>

Defined in: [presentation/renderers/WebGPURenderer.ts:134](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/presentation/renderers/WebGPURenderer.ts#L134)

Ciclo principal: renderiza a cena pela perspectiva da câmera.

#### Parameters

##### scene

[`Scene`](Scene.md)

##### camera

[`Camera`](Camera.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Renderer`](../interfaces/Renderer.md).[`render`](../interfaces/Renderer.md#render)

***

### setClearColor()

> **setClearColor**(`r`, `g`, `b`, `a`): `void`

Defined in: [presentation/renderers/WebGPURenderer.ts:128](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/presentation/renderers/WebGPURenderer.ts#L128)

Define a cor de fundo.

#### Parameters

##### r

`number`

##### g

`number`

##### b

`number`

##### a

`number`

#### Returns

`void`

#### Implementation of

[`Renderer`](../interfaces/Renderer.md).[`setClearColor`](../interfaces/Renderer.md#setclearcolor)

***

### setSize()

> **setSize**(`width`, `height`): `void`

Defined in: [presentation/renderers/WebGPURenderer.ts:122](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/presentation/renderers/WebGPURenderer.ts#L122)

Define o tamanho físico da tela de saída.

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`void`

#### Implementation of

[`Renderer`](../interfaces/Renderer.md).[`setSize`](../interfaces/Renderer.md#setsize)
