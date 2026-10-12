[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ELEMENT\_CONSUMERS

# Variable: ELEMENT\_CONSUMERS

> `const` **ELEMENT\_CONSUMERS**: readonly `ConsumerResolver`[]

Defined in: [elements/consumers.ts:13](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/consumers.ts#L13)

Resolvers de `consumes` dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
aplicação): `Camera` (a primeira câmera inserida que continua na cena), `GravityField` e `ParticleMaterial`. Os
pools (`WorldTransform`, `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o
`PoolResolver` registrado pela C2 ao serem criados; o `Time` é registrado pela cena.
