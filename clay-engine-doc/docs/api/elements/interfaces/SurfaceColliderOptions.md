[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceColliderOptions

# Interface: SurfaceColliderOptions

Defined in: [elements/physics/colliders/SurfaceCollider.ts:26](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L26)

Opções do `SurfaceCollider`.

## Properties

### band?

> `readonly` `optional` **band?**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:40](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L40)

Células de folga em volta da caixa da superfície (distância). Padrão 2.

***

### margin?

> `readonly` `optional` **margin?**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:38](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L38)

Folga de contato (m), somada ao raio de quem colide. Padrão 0, como os outros colliders: uma folga maior que a
dos contatos entre corpos desestabiliza pilhas (os corpos pairam sobre a superfície e se apertam entre si).

***

### mode?

> `readonly` `optional` **mode?**: [`SurfaceColliderMode`](../type-aliases/SurfaceColliderMode.md)

Defined in: [elements/physics/colliders/SurfaceCollider.ts:28](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L28)

`'height'` (gráfico y = h(x, z) no espaço local; padrão) ou `'distance'` (superfície geral).

***

### resolution?

> `readonly` `optional` **resolution?**: `number` \| readonly `number`[]

Defined in: [elements/physics/colliders/SurfaceCollider.ts:33](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L33)

Resolução do campo: altura `[nx, nz]` (padrão 128²); distância `[n, n, n]` (padrão 64³). Um número vale para
todos os eixos.

***

### sampling?

> `readonly` `optional` **sampling?**: readonly \[`number`, `number`\]

Defined in: [elements/physics/colliders/SurfaceCollider.ts:47](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L47)

Resolução `[nu, nv]` da grade em que a superfície é avaliada para o campo. Padrão: a do campo (xz) ou 2 × n.

***

### steps?

> `readonly` `optional` **steps?**: `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:45](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L45)

Cópias do campo — uma por passo fixo do quadro quando a superfície anima (spec 010, R2). Padrão 4
(`Time.maxStepsPerFrame` padrão); quadros com mais passos repetem a última cópia.
