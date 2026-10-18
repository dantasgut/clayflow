# Quickstart: verificar a 034

```bash
npm run smoke -- refraction --headless                 # nitidez, referência da CPU, fora do quadro, custo
npm run smoke -- fluidSurface,parametricSurfaces,softSurface,extensionPoints,nodeGraphs --headless
npm run build:lib && npm run smoke -- <todos> --dist --headless
npm run bench:check
npm run ci
```

Cena mínima de vidro (autoria inalterada):

```ts
world.insert(
  new SphereGeometry({ radius: 0.5 })
    .add(new StandardMaterial())
    .add(new MaterialFunction({ code: glassCode })) // closure_transmission(...), IOR 1,5
    .add(new Transform({ position: [0, 0.5, 0, 1] })),
);
```

Esperado: o tabuleiro atrás da esfera invertido e ampliado, liso com a câmera encostada na esfera; um objeto fora do
quadro aparece na refração.

Tempo de GPU:

```ts
app.events.on('frameComplete', (e) => {
  if (e.stats.gpuFrame !== undefined) samples.set(e.stats.gpuFrame, e.stats.gpuTimeMs!); // cada quadro uma vez
});
```
