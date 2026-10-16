# Quickstart: grafos de nós

```ts
import {
  Application,
  Entity,
  NodeGraph,
  nodes,
  StandardMaterial,
  Transform,
  ParametricSurface,
  materialPoint,
} from 'clayflow';

const app = await Application.create({ canvas });

// 1. Grafo de ponto: cor e rugosidade por ruído e curvatura, animadas no tempo
const look = new NodeGraph({
  target: materialPoint,
  nodes: {
    s: nodes.input.surfaceSample(),
    t: nodes.input.time(),
    p: nodes.math.add, // posição + deslocamento no tempo
    n: nodes.noise.fbm.with({ scale: 3, octaves: 5 }),
    k: nodes.surface.meanCurvature(),
    m: nodes.math.mix,
    c: nodes.color.ramp.with({
      stops: [
        [0, [0.05, 0.1, 0.3, 1]],
        [1, [0.9, 0.8, 0.5, 1]],
      ],
    }),
    out: nodes.output.surfaceParams(),
  },
  links: [
    ['s.position', 'p.a'],
    ['t.seconds', 'p.b'],
    ['p.value', 'n.p'],
    ['n.value', 'm.a'],
    ['k.value', 'm.b'],
    ['m.value', 'c.t'],
    ['c.color', 'out.albedo'],
    ['n.value', 'out.roughness'],
  ],
});
app.world.insert(
  new Entity([
    new ParametricSurface({ preset: 'torus', differential: true }),
    new StandardMaterial(),
    look,
    new Transform(),
  ]),
);

// 2. Grafo de conjunto: terreno com pedras espalhadas (ver contracts/node-graphs.md)
```

Verificação: `npm run smoke -- nodeGraphs,extensionPoints,render,fluidSurface --headless` (fonte e `--dist`); `npm run
bench:check`; `npm run ci`.
