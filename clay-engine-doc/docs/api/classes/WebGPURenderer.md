[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / WebGPURenderer

# Class: WebGPURenderer

Defined in: [presentation/renderers/WebGPURenderer.ts:33](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/presentation/renderers/WebGPURenderer.ts#L33)

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

Defined in: [presentation/renderers/WebGPURenderer.ts:97](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/presentation/renderers/WebGPURenderer.ts#L97)

#### Parameters

##### world?

[`SimulationWorld`](../interfaces/SimulationWorld.md)

#### Returns

`WebGPURenderer`

## Methods

### initialize()

> **initialize**(`canvas`): `Promise`\<`void`\>

Defined in: [presentation/renderers/WebGPURenderer.ts:119](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/presentation/renderers/WebGPURenderer.ts#L119)

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

Defined in: [presentation/renderers/WebGPURenderer.ts:136](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/presentation/renderers/WebGPURenderer.ts#L136)

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

Defined in: [presentation/renderers/WebGPURenderer.ts:130](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/presentation/renderers/WebGPURenderer.ts#L130)

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

Defined in: [presentation/renderers/WebGPURenderer.ts:124](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/presentation/renderers/WebGPURenderer.ts#L124)

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
