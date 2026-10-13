# Quickstart: Estado de cena na GPU

## Muitas cópias do mesmo objeto

```ts
for (let i = 0; i < 10_000; i++) {
  const box = new BoxGeometry({ size: [1, 1, 1] }); // mesma chave de conteúdo → 1 cópia na GPU
  box.add(new StandardMaterial({ albedo: colors[i] }));
  box.add(new Transform({ position: positions[i] }));
  app.world.insert(box);
}
// forward: 1 draw com 10 000 instâncias; sombra: 1 draw
```

## Câmera

```ts
const camera = new Camera({
  projection: 'perspective',
  fov: Math.PI / 4,
  near: 0.1,
  far: 100,
  aspectMode: 'canvas',
});
camera.add(
  new Transform({ position: [0, 3, 6, 1], rotation: lookAtRotation([0, 3, 6], [0, 0, 0]) }),
);
camera.add(new OrbitController({ target: [0, 0, 0] }));
app.world.insert(camera);
```

As matrizes são produzidas pelo `CameraFlow`; o controller muta só o `Transform`.

## Hierarquia

```ts
const arm = app.world.insert(armGeometry); // com Transform
const hand = new BoxGeometry({ size: [0.2, 0.2, 0.2] });
hand.add(new Transform({ position: [0, 1, 0, 1] }));
hand.add(new Parent({ entity: arm }));
app.world.insert(hand);
```

## Pose de um corpo na CPU

```ts
const pose = await app.world.read(ballTransform); // { position, rotation, scale } do último passo
```

## Validar

```sh
npm run test
npm run smoke -- render,trajectories,rigidContacts,churn,bigMesh,scale1m
npm run smoke -- render,trajectories,rigidContacts,churn,bigMesh,scale1m --dist
npm run bench -- --scene instances
npm run bench -- --scene rigid-bodies
npm run bench:check
```
