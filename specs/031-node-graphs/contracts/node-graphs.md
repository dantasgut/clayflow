# Contrato: recursos de shader, pontos de cena e grafos de nós

## Recursos declarados (C3/C4 sobre a C2)

```ts
// Declarado uma vez, num módulo próprio; quem usa põe em `requires`.
export const worldsResource = wgslResource({
  name: 'worlds',
  binding: { storage: 'read' },
  type: { schema: Transform.worldSchema, array: true },
  frequency: 'stage',
  provider: { pool: Transform.worldSchema.name },
});

export const forward = wgslModule({
  name: 'forward',
  source: forwardSource, // sem nenhuma linha @group/@binding
  requires: [
    brdf,
    NONE.module,
    forwardCameraReady,
    materialPointTypes,
    forwardMaterialReady,
    sceneLightDirectionReady, // pontos de cena: o forward não conhece luz, sombra nem água
    lightVisibilityReady,
    lightTransmissionReady,
    camerasResource,
    worldsResource,
    renderablesResource,
    instancesResource,
    surfaceDiffReadResource,
    standardMaterialsResource,
    forwardFrameResource,
  ],
});

// Recurso privado: o estágio liga pelo objeto, nunca por string (um Map<BindingKey, BindingSource>).
ctx.bind(new Map([[surfaceDiffReadResource, buffer]]));
ctx.bind(new Map([[{ pipeline: id, resource: effectResources.params }, params]])); // só neste pipeline

// Desenho sem índices de grupo.
for (const frequency of BINDING_FREQUENCIES)
  for (const g of prepared.groupsOf(frequency)) pass.bind.setBindGroup(g.index, g.spec);
kernel.bindTo(pass.bind, { draw: [offset] }); // ou tudo de uma vez, com os offsets dinâmicos por frequência
```

`binding`: `{ storage: 'read' | 'read_write' }`, `{ uniform: true }`, `{ texture: { sample, dimension?, multisampled? } }`,
`{ storageTexture: { format, access, dimension? } }`, `{ sampler: 'filtering' | 'comparison' }`. `provider`:
`{ pool }`, `{ consumer }`, `{ slot, part?, descriptor? }`, `{ scene }`, `'private'`. Grupo = posto da frequência
(`frame` < `stage` < `batch` < `draw`) entre as presentes no shader; ligação = ordem do nome.

Erros na criação/montagem/preparação: `manual-binding`, `unresolved-reference` (função sem definição ou recurso usado
sem estar em `requires`), `symbol-conflict`, `limit-exceeded` (conferido na preparação do pipeline e em
`createComputeKernel`).

## Constantes

```ts
export const WORKGROUP_SIZE = sharedConstant('WORKGROUP_SIZE', 64, 'u32'); // WORKGROUP_SIZE.value no TS
// WGSL: @compute @workgroup_size(WORKGROUP_SIZE) — o módulo da constante entra por `requires` (WORKGROUP_SIZE.module).
```

Variantes por `override`: `PipelineDescriptor.constants` e `createComputeKernel({ constants })`.

## Pontos de cena

```wgsl
fn scene_light_direction() -> vec3f                                   // primeiro contribuinte; pronto = DEFAULT_LIGHT_DIRECTION
fn light_visibility(p: vec3f, n_dot_l: f32) -> f32                    // produto ordenado; pronto = 1.0
fn light_transmission(p: vec3f, ambient: f32, direct: f32) -> vec3f   // primeiro com ambiente; pronto = vec3f(ambient + direct)
fn scene_any_light_direction() -> vec3f                               // primeira luz viva do pool Light; pronto = DEFAULT_LIGHT_DIRECTION
```

```ts
interface SceneContribution {
  readonly point: ContributionPoint;
  readonly order: number;
  readonly pools: readonly StructSchema[];
  build(slotOf: (pool: StructSchema) => number | undefined): WgslModule | undefined;
}
class DirectionalLight /* … */ {
  getSceneContributions() {
    // sempre: a primeira luz viva (scene_any_light_direction, lida na GPU pelo bitset Light.live);
    // com ShadowMap: direção (scene_light_direction) e sombra PCF (light_visibility), order 0, pools Light e ShadowMap
    return this.shadowMap === undefined
      ? [anyLightContribution]
      : [anyLightContribution, ...shadowCasterContributions(() => this.data.castShadow === 1)];
  }
}
class PointLight /* … */ {
  getSceneContributions() {
    return [anyLightContribution];
  }
}
class WaterSurface /* … */ {
  getSceneContributions() {
    return [
      {
        point: lightTransmissionPoint,
        order: 0,
        pools: [],
        build: () => (this.rawData.caustics === 1 ? waterTransmission : undefined),
      },
    ];
  }
}
```

## Nós e grafos

```ts
const noise3 = defineNode({
  name: 'noise.gradient3',
  inputs: { p: 'vec3f' },
  outputs: { value: 'f32' },
  params: {
    scale: { type: 'f32', default: 1 },
    offset: { type: 'vec3f' },
    seed: { type: 'u32', default: 0 },
  },
  code: nodeNoise, // fn node_noise_gradient3(p: vec3f, scale: f32, offset: vec3f, seed: u32) -> f32
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

// Grafo de conjunto: um Resource (SetGraph) com o grafo; o GraphFlow (fase transform) o executa e escreve a
// GraphGeometry da mesma entidade, desenhada pelo forward e pela sombra.
const scatter = new NodeGraph({
  nodes: {
    grid: nodes.set.grid.with({ resolution: [256, 256], size: [20, 20] }),
    pos: graphArgument('position'),
    h: noise3.with({ scale: 0.3 }),
    disp: nodes.set.displace,
    nrm: nodes.set.recomputeNormals,
    pts: nodes.set.distributeOnMesh,
    rock: nodes.set.realizeInstances,
    out: nodes.set.meshOutput,
  },
  links: [
    ['grid.mesh', 'disp.mesh'],
    ['pos.value', 'h.p'],
    ['h.value', 'disp.height'], // grafo de ponto fundido no kernel de `disp`
    ['disp.mesh', 'nrm.mesh'],
    ['nrm.mesh', 'pts.mesh'],
    ['h.value', 'pts.density'],
    ['pts.points', 'rock.points'],
    ['rock.mesh', 'out.mesh'],
  ],
});
const graph = new SetGraph({ graph: scatter });
world.insert(
  graph
    .add(new GraphGeometry({ vertexCapacity, indexCapacity })) // capacidades do plano: compileSetGraph(scatter, …)
    .add(new StandardMaterial())
    .add(new Transform()),
);
graph.values.h_scale = 0.5; // refeito no quadro seguinte; parado, nada é refeito

// Sub-grafos e serialização
const wave = Subgraph.point(waveGraph, {
  name: 'my.wave',
  inputs: { t: 'f32' },
  expose: ['w.amp'],
}); // nó de ponto
const filterStage = Subgraph.set(stageGraph, {
  name: 'my.filter',
  inputs: { in: 'm.in' },
  outputs: { out: 'f.out' },
});
const json = toJSON(scatter, defaultNodeRegistry);
const again = fromJSON(json, defaultNodeRegistry); // mesma forma, mesmo código
```

Biblioteca (C3, `src/elements/nodes`): `nodes.input` (entradas de contexto, argumentos do ponto: `surfaceSample`,
`worldPosition`, `material`, `time`, `vertexField`, `particle`, `cell`, `camera`), 64 nós de ponto em `nodes.math`,
`map`, `color`, `noise`, `condition`, `space`, `field`, `surface`, `output` (cada um com referência da CPU e tolerância
em `reference/`) e 12 nós de conjunto em `nodes.set`; todos os nós (não as entradas) em `defaultNodeRegistry`.
`fromJSON` reconstrói os nós WGSL do usuário pelo código e compartilha os módulos deles por nome e código.

Eventos e erros: `extensionRejected` (já existente) para grafos de ponto que não compilam (a função anterior, ou a
pronta, continua); a validação estrutural é síncrona — `NodeGraphError` (`node-signature`, `unknown-node`,
`unknown-port`, `type-mismatch`, `unconnected-input`, `duplicate-link`, `cycle`, `context`, `target`,
`serialization`) lançado na criação, na alteração (`setGraph`) e na leitura (`fromJSON`). Não há evento
`graphRejected`.

## Garantias

- Nenhuma linha `@group/@binding` em módulos; nenhuma ligação por string; nenhum índice de grupo em estágios.
- Forward, sprites de vértice, sprites de corpos de partículas, partículas secundárias e composição da água não
  referenciam recursos de sombra, luz ou água: chegam pelos pontos de cena (`particle_sprite` pelo
  `scene_any_light_direction`; o `ParticleFlow` não tem slot de luzes).
- Dado produzido em alguns quadros tem estado genérico na C2: `TransitionContext.produced` pelo produtor,
  `ResourceDirectory.isProduced` pelos consumidores, um produtor por descritor.
- Funções da 009 funcionam sem mudança de API.
- Imagens e trajetórias das fixtures existentes iguais bit a bit.
- Grafo de ponto: cada nó avaliado uma vez por amostra; custo igual ao WGSL escrito à mão.
- Grafo de conjunto: contagens na GPU, sem leitura de volta; nada refeito com entradas e parâmetros parados.
