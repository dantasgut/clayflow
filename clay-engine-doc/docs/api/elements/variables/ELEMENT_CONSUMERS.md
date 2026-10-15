[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ELEMENT\_CONSUMERS

# Variable: ELEMENT\_CONSUMERS

> `const` **ELEMENT\_CONSUMERS**: readonly `ConsumerResolver`[]

Defined in: [elements/consumers.ts:12](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/consumers.ts#L12)

Resolvers de `consumes` dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
aplicação): `GravityField` e `ParticleMaterial`. Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
`Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o `PoolResolver` registrado pela C2
ao serem criados; o `Time` é registrado pela cena.
