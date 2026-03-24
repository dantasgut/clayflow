[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / NarrowphaseConfig

# Interface: NarrowphaseConfig

Defined in: [scene/systems/collision/NarrowphaseConfig.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/collision/NarrowphaseConfig.ts#L20)

Configuração do sistema de narrowphase.

Permite customizar qual algoritmo é usado para cada par de formas,
sem precisar instanciar e registrar manualmente as classes de algoritmo.

## Example

```ts
const world = new PhysicsWorld({
  narrowphase: {
    boxBox:    CollisionAlgorithmType.SAT,
    boxSphere: CollisionAlgorithmType.SAT,
    overrides: {
      'Capsule:Capsule': CollisionAlgorithmType.SDF_GRADIENT,
    },
  },
});
```

## Properties

### boxBox?

> `optional` **boxBox?**: [`CollisionAlgorithmType`](../enumerations/CollisionAlgorithmType.md)

Defined in: [scene/systems/collision/NarrowphaseConfig.ts:22](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/collision/NarrowphaseConfig.ts#L22)

Algoritmo para Box vs Box. Default: SAT.

***

### boxSphere?

> `optional` **boxSphere?**: [`CollisionAlgorithmType`](../enumerations/CollisionAlgorithmType.md)

Defined in: [scene/systems/collision/NarrowphaseConfig.ts:26](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/collision/NarrowphaseConfig.ts#L26)

Algoritmo para Box vs Sphere. Default: SAT.

***

### overrides?

> `optional` **overrides?**: `Record`\<`string`, [`CollisionAlgorithmType`](../enumerations/CollisionAlgorithmType.md)\>

Defined in: [scene/systems/collision/NarrowphaseConfig.ts:32](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/collision/NarrowphaseConfig.ts#L32)

Overrides livres por par de formas.
Chave: 'ShapeA:ShapeB' em ordem alfabética (ex: 'Box:Capsule').
Sobrescreve os campos acima e os defaults do dispatcher.

***

### sphereSphere?

> `optional` **sphereSphere?**: [`CollisionAlgorithmType`](../enumerations/CollisionAlgorithmType.md)

Defined in: [scene/systems/collision/NarrowphaseConfig.ts:24](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/collision/NarrowphaseConfig.ts#L24)

Algoritmo para Sphere vs Sphere. Default: SPHERE_ANALYTIC.
