# Quickstart: grafos de nós

```ts
import {
  Application,
  NodeGraph,
  SetGraph,
  GraphGeometry,
  MaterialFunction,
  ParametricSurface,
  StandardMaterial,
  Transform,
  compileSetGraph,
  graphArgument,
  nodes,
} from 'clayflow';

const app = await Application.create({ canvas });

// 1. Grafo de ponto: cor e rugosidade por ruído da posição (ramificação: o ruído é avaliado uma vez por amostra),
//    hospedado pela função do ponto `material` da 009.
const look = new NodeGraph({
  nodes: {
    s: nodes.input.surfaceSample(), // argumento `s` do ponto: world_position, normal, uv, time, metric, curvature…
    n: nodes.noise.gradient3.with({ scale: 3, offset: [0, 0, 0] }),
    c: nodes.color.ramp.with({
      color_a: [0.05, 0.1, 0.3],
      color_b: [0.9, 0.8, 0.5],
      low: -0.6,
      high: 0.6,
    }),
    out: nodes.output.surfaceParams, // entradas sem ligação: as constantes do material
  },
  links: [
    ['s.world_position', 'n.p'],
    ['n.value', 'c.t'],
    ['c.color', 'out.base_color'],
    ['n.value', 'out.roughness'],
  ],
  output: 'out.value',
});
const material = new MaterialFunction({ graph: look });
app.world.insert(
  new ParametricSurface({ preset: 'torus', differential: true })
    .add(new StandardMaterial())
    .add(new Transform())
    .add(material),
);
material.values.n_scale = 5; // quadro seguinte, sem recompilar

// 2. Grafo de conjunto: grade → deslocar por ruído → normais → pontos por densidade → esferas, numa GraphGeometry.
const scatter = new NodeGraph({
  nodes: {
    g: nodes.set.grid.with({ resolution: [64, 64], size: [4, 4] }),
    p: graphArgument('position'),
    h: nodes.noise.gradient3.with({ scale: 1.5 }),
    d: nodes.set.displace.with({ scale: 0.3 }),
    n: nodes.set.recomputeNormals,
    q: nodes.input.vertexField('position'),
    k: nodes.noise.gradient3.with({ scale: 3, offset: [7, 0, 0] }),
    s: nodes.set.distributeOnMesh.with({ per_triangle: 1, seed: 1 }),
    r: nodes.set.realizeInstances.with({ radius: 0.03 }),
    o: nodes.set.meshOutput,
  },
  links: [
    ['g.mesh', 'd.mesh'],
    ['p.value', 'h.p'],
    ['h.value', 'd.height'],
    ['d.mesh', 'n.mesh'],
    ['n.mesh', 's.mesh'],
    ['q.value', 'k.p'],
    ['k.value', 's.density'],
    ['s.points', 'r.points'],
    ['r.mesh', 'o.mesh'],
  ],
});
const graph = new SetGraph({ graph: scatter });
const plan = compileSetGraph(scatter, (id) => graph.valuesOf(id));
const cap = (key: string) => plan.sets.find((s) => s.key === key)!.capacity;
app.world.insert(
  graph
    .add(
      new GraphGeometry({
        vertexCapacity: cap('r.mesh.vertices'),
        indexCapacity: cap('r.mesh.triangles') * 3,
      }),
    )
    .add(new StandardMaterial({ albedo: [0.85, 0.55, 0.25, 1] }))
    .add(new Transform()),
);
graph.values.s_seed = 8; // refeito no quadro seguinte; parado, nada é refeito
```

Guia completo: `clay-engine-doc/docs/guides/node-graphs.md`.

Verificação: `npm run smoke -- nodeGraphs,extensionPoints,render,fluidSurface --headless` (fonte e `--dist`); `npm run
bench:check`; `npm run ci`.
