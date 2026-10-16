# Quickstart: HDR e material em camadas

```ts
import {
  Application,
  DirectionalLight,
  PointLight,
  Materials,
  StandardMaterial,
  SphereGeometry,
  Transform,
  Entity,
} from 'clayflow';

const app = await Application.create({ canvas });
const { defaults } = app;

// Apresentação: AgX, exposição neutra, saída HDR quando a tela suportar
defaults.presentation.set({ operator: 'agx', exposure: 0, output: 'hdr' });
defaults.ambient.set({
  skyColor: [0.55, 0.65, 0.85, 1],
  groundColor: [0.2, 0.17, 0.12, 1],
  intensity: 0.8,
});

app.world.insert(
  new DirectionalLight({ direction: [0.3, -1, 0.4], intensity: 3, castShadow: true }),
);
app.world.insert(
  new PointLight({ position: [0, 2, 2], color: [1, 0.7, 0.4, 1], intensity: 30, range: 10 }),
);

// Galeria
const looks = [
  Materials.WOOD_RAW(),
  Materials.WOOD_VARNISHED_GLOSS(),
  Materials.VELVET({ fuzzColor: [0.5, 0.05, 0.15, 1] }),
  Materials.METAL_BRUSHED(),
  Materials.CAR_PAINT({ albedo: [0.6, 0.02, 0.02, 1] }),
  Materials.GLASS(),
  Materials.SKIN(),
];
looks.forEach((material, i) =>
  app.world.insert(
    new Entity([
      new SphereGeometry({ radius: 0.4 }),
      material,
      new Transform({ position: [i - 3, 0.4, 0] }),
    ]),
  ),
);
```

Verificação: `npm run smoke -- materials,hdr,lighting,fluidSurface --headless` (medidas no relatório);
comparação: `npm run bench -- --scene materials,point-lights --engines clayflow,three --headless`.
