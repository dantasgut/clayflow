[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ELEMENT\_CONSUMERS

# Variable: ELEMENT\_CONSUMERS

> `const` **ELEMENT\_CONSUMERS**: readonly [`ConsumerResolver`](../../platform/web/interfaces/ConsumerResolver.md)[]

Defined in: [src/elements/consumers.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/consumers.ts#L26)

Resolvers (fornecedores `{ consumer }`) dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
aplicação): `GravityField`, `ParticlePhysics` e o mapa de sombra que projeta (`ShadowCaster.atlas`: a
tabela e as páginas, spec 031 e T060h) as tabelas do sombreamento físico (`PbrTables.dfg`, `PbrTables.sampler`, spec 011), a estrutura de raios (`RayScene.info`), o céu físico (`Sky.*`) e a iluminação global (`GlobalIllumination.*`, spec 033). Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
`Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o `PoolResolver` registrado pela C2
ao serem criados; o `Time` é registrado pela cena.
