# Quickstart: Geometria em compute

## Fluido visível

```ts
const n = 4096;
const position = new Float32Array(n * 4); // x, y, z, 0 por partícula
// …preencher um bloco…
const fluid = new FluidBody({ algorithm: 'SPH', position }).add(
  new PointSpriteMaterial({ color: [0.2, 0.5, 1, 1], radius: 0.03 }),
);
app.world.insert(fluid);
```

Um draw para as 4 096 partículas; posições lidas do pool do SPH; nenhuma leitura de volta.

## Corpo mole com malha

```ts
const cloth = new SoftBody({
  algorithm: 'XPBD',
  position, // N × 4
  mass, // N (0 = fixo)
  edges: { a, b }, // restrições de distância internas (índices locais)
  surface: { triangles }, // índices locais
})
  .add(new StandardMaterial({ albedo: [0.8, 0.3, 0.3, 1] }))
  .add(new Transform());
app.world.insert(cloth);
```

## Restrição entre corpos

```ts
new DistanceConstraint({
  a: { body: clothA, index: 0 },
  b: { body: clothB, index: 12 },
  restLength: 0.1,
});
```

## Nuvem de pontos escrita por um estágio

```ts
const cloud = new PointCloudGeometry({ maxPoints: 10_000 })
  .add(new PointSpriteMaterial({ radius: 0.01 }))
  .add(new Transform());
// O estágio declara owns: [[PointCloudGeometry, 'vertices']] e escreve o buffer em compute.
```

## Topologia

`WireframeMaterial` desenha arestas; `PointSpriteMaterial` desenha sprites nos vértices; `StandardMaterial`, faces.

## Verificação

```sh
npm run smoke -- particles softSurface pointCloud render trajectories
npm run smoke -- particles softSurface pointCloud render trajectories --dist
npm run bench -- --scene particles
```
