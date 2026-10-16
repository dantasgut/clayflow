# Contrato: recursos de shader, pontos de cena e grafos de nós

## Recursos declarados (C3/C4 sobre a C2)

```ts
// Declarado uma vez, num módulo próprio; quem usa põe em `requires`.
export const worldsResource = wgslResource({
  name: 'worlds',
  binding: { storage: 'read' },
  type: { schema: WorldTransformSchema, array: true },
  frequency: 'stage',
  provider: { pool: WorldTransformSchema },
});

export const forward = wgslModule({
  name: 'forward',
  source: forwardSource, // sem nenhuma linha @group/@binding
  requires: [
    camerasResource,
    worldsResource,
    renderablesResource,
    materialsResource,
    lightVisibility,
    sceneLight,
  ],
});

// Recurso privado: o estágio liga pelo objeto, nunca por string.
ctx.bind(new Map([[waterDepthResource, { texture: depthView }]]));

// Desenho sem índices de grupo.
for (const g of prepared.groupsOf('batch'))
  pass.bind.setBindGroup(g.index, g.spec, g.dynamic ? [offset] : undefined);
```

Erros na criação/montagem: `manual-binding`, `unresolved-reference` (variável), `symbol-conflict`, `limit-exceeded`.

## Constantes

```ts
export const WORKGROUP_SIZE = sharedConstant('WORKGROUP_SIZE', 64, 'u32'); // WORKGROUP_SIZE.value no TS
// WGSL: @compute @workgroup_size(WORKGROUP_SIZE) — o módulo da constante entra por `requires`.
```

## Pontos de cena

```wgsl
fn light_visibility(p: vec3f, n: vec3f, light: u32) -> f32   // produto ordenado; pronto = 1.0
fn scene_light(p: vec3f) -> SceneLight                         // pronto = direção padrão
```

```ts
class ShadowMap /* … */ {
  getSceneContributions() {
    return [{ point: lightVisibilityPoint, module: shadowVisibility, order: 0 }];
  }
}
class WaterSurface /* … */ {
  getSceneContributions() {
    return [{ point: lightVisibilityPoint, module: causticVisibility, order: 10 }];
  }
}
```

## Nós e grafos

```ts
const noise3 = defineNode({
  name: 'noise.gradient3',
  inputs: { p: 'vec3f' },
  outputs: { value: 'f32' },
  params: { scale: { type: 'f32', default: 1 }, offset: { type: 'vec3f' } },
  code: nodeNoise, // fn node_noise_gradient3(p: vec3f, scale: f32, offset: vec3f) -> f32
  fn: 'node_noise_gradient3',
  contexts: ['fragment', 'vertex', 'compute'],
});

// Grafo de ponto: a forma (imutável). Entradas do ponto são argumentos (`s` = SurfaceSample do ponto `material`).
const look = new NodeGraph({
  nodes: {
    s: nodes.input.surfaceSample(), // graphArgument('s', { world_position: 'vec3f', … })
    n: noise3.with({ scale: 4 }),
    c: nodes.color.ramp.with({ color_a: [0.1, 0.1, 0.1], color_b: [0.9, 0.6, 0.2] }),
    out: nodes.output.surfaceParams, // entradas sem ligação: as constantes do material (`m`)
  },
  links: [
    ['s.world_position', 'n.p'],
    ['n.value', 'c.t'],
    ['c.color', 'out.base_color'],
    ['n.value', 'out.roughness'], // saída usada duas vezes → avaliada uma vez
  ],
  output: 'out.value',
});
const material = new MaterialFunction({ graph: look }); // a função da 009, montada pelo grafo
entity.add(material);
material.values.n_scale = 8; // quadro seguinte, sem recompilar
material.setGraph(other); // topologia nova → revisão +1, recompila em transição; falha mantém a anterior

// Grafo de conjunto → Flow
const terrainScatter = new NodeGraph({
  target: { phase: 'transform' },
  nodes: {
    grid: nodes.set.grid.with({ size: [256, 256], extent: [20, 20] }),
    disp: nodes.set.displace,
    h: noise3.with({ scale: 0.3 }),
    nrm: nodes.set.recomputeNormals,
    pts: nodes.set.distributeOnMesh.with({ maxPoints: 20000 }),
    rock: nodes.set.realizeInstances.with({ mesh: sphereMesh, scale: 0.15 }),
    out: nodes.set.meshOutput,
  },
  links: [
    ['grid.mesh', 'disp.mesh'],
    ['h.value', 'disp.height'], // grafo de ponto fundido no kernel de `disp`
    ['disp.mesh', 'nrm.mesh'],
    ['nrm.mesh', 'pts.mesh'],
    ['h.value', 'pts.density'],
    ['pts.points', 'rock.points'],
    ['rock.mesh', 'out.mesh'],
  ],
});
world.insert(new Entity([terrainScatter.geometry, new StandardMaterial(), new Transform()]));

// Sub-grafo e serialização
const rocky = Subgraph.from(terrainScatter, { expose: ['h.scale', 'pts.maxPoints'] });
const json = terrainScatter.toJSON();
const again = NodeGraph.fromJSON(json, defaultNodeRegistry); // mesma identidade
```

Eventos: `extensionRejected` (já existente) para grafos que não compilam; `graphRejected { graph, node?, reason }` para
validação estrutural síncrona (lançada como erro na criação/alteração e emitida quando a alteração vem por
serialização).

## Garantias

- Nenhuma linha `@group/@binding` em módulos; nenhuma ligação por string; nenhum índice de grupo em estágios.
- Forward, sprites e água não referenciam recursos de sombra, luz ou água: chegam pelos pontos de cena.
- Funções da 009 funcionam sem mudança de API.
- Imagens e trajetórias das fixtures existentes iguais bit a bit.
- Grafo de ponto: cada nó avaliado uma vez por amostra; custo igual ao WGSL escrito à mão.
- Grafo de conjunto: contagens na GPU, sem leitura de volta; nada refeito com entradas e parâmetros parados.
