# Interface: Renderer

Defined in: [presentation/interfaces/Renderer.ts:11](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/presentation/interfaces/Renderer.ts#L11)

Contrato abstrato (Camada 4) para qualquer tipo de Motor de Apresentação.
Separa a lógica da Cena da API gráfica final.

O usuário nunca toca na Camada 1 (WebGPUEngineCore, device, queue, etc.).
Toda a inicialização de hardware é feita aqui dentro.

## Methods

### initialize()

> **initialize**(`canvas`): `Promise`\<`void`\>

Defined in: [presentation/interfaces/Renderer.ts:17](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/presentation/interfaces/Renderer.ts#L17)

Inicializa o backend gráfico e adquire o device da GPU.
Deve ser chamado uma vez antes do primeiro render().

#### Parameters

##### canvas

`HTMLCanvasElement`

O elemento <canvas> do DOM.

#### Returns

`Promise`\<`void`\>

***

### render()

> **render**(`scene`, `camera`): `Promise`\<`void`\>

Defined in: [presentation/interfaces/Renderer.ts:22](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/presentation/interfaces/Renderer.ts#L22)

Ciclo principal: renderiza a cena pela perspectiva da câmera.

#### Parameters

##### scene

[`Scene`](../classes/Scene.md)

##### camera

[`Camera`](../classes/Camera.md)

#### Returns

`Promise`\<`void`\>

***

### setClearColor()

> **setClearColor**(`r`, `g`, `b`, `a`): `void`

Defined in: [presentation/interfaces/Renderer.ts:32](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/presentation/interfaces/Renderer.ts#L32)

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

***

### setSize()

> **setSize**(`width`, `height`): `void`

Defined in: [presentation/interfaces/Renderer.ts:27](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/presentation/interfaces/Renderer.ts#L27)

Define o tamanho físico da tela de saída.

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`void`
