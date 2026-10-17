# Quickstart: HDR e materiais por nós

```ts
import {
  Application,
  DirectionalLight,
  PointLight,
  Materials,
  MaterialFunction,
  NodeGraph,
  StandardMaterial,
  SphereGeometry,
  Transform,
  nodes,
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

// Galeria: materiais prontos (sub-grafos), ajustados por parâmetro exposto
const looks = [
  Materials.woodRaw(),
  Materials.woodVarnishedGloss(),
  Materials.velvet({ color: [0.5, 0.05, 0.15] }),
  Materials.metalBrushed(),
  Materials.carPaint({ base_color: [0.6, 0.02, 0.02] }),
  Materials.glass(),
  Materials.skin(),
];
looks.forEach((material, i) =>
  app.world.insert(
    new SphereGeometry({ radius: 0.4 })
      .add(new StandardMaterial())
      .add(new Transform({ position: [i - 3, 0.4, 0, 1] }))
      .add(material),
  ),
);

// Composição: madeira crua e metal escovado misturados por ruído
const mixed = new NodeGraph({
  nodes: {
    s: nodes.input.surfaceSample(),
    a: nodes.material.woodRaw,
    b: nodes.material.metalBrushed,
    n: nodes.noise.gradient3.with({ scale: 3 }),
    x: nodes.closure.mix,
    out: nodes.output.closure,
  },
  links: [
    ['s.world_position', 'n.p'],
    ['a.value', 'x.a'],
    ['b.value', 'x.b'],
    ['n.value', 'x.t'],
    ['x.value', 'out.closure'],
  ],
  output: 'out.value',
});
app.world.insert(
  new SphereGeometry({ radius: 0.6 })
    .add(new StandardMaterial())
    .add(new Transform({ position: [0, 0.6, -2, 1] }))
    .add(new MaterialFunction({ graph: mixed })),
);
```

Verificação: `npm run smoke -- materials,hdr,lighting,nodeGraphs,fluidSurface --headless` (medidas no relatório);
comparação: `npm run bench -- --scene materials,point-lights --engines clayflow,three --headless`.
