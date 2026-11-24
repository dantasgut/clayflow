---
sidebar_position: 15
title: Grafos de nós
---

# Grafos de nós — compondo regras e processos por nós (spec 031)

Um **grafo de nós** monta comportamento ligando peças pequenas, como os nós de shader e de geometria do Blender. O
motor tem dois níveis de nó:

| Nível | Avalia | Vira | Hospedado por |
|---|---|---|---|
| **Ponto** | uma amostra (pixel, vértice, partícula, elemento de um conjunto) | uma função WGSL, fundida no shader que a usa — um `let` por nó | as funções dos pontos de extensão da 009 (`MaterialFunction`, `SurfaceFunction`…) e as entradas de ponto dos nós de conjunto |
| **Conjunto** | um conjunto inteiro (malha, pontos, lista u32) | passes de compute, com contagens decididas na GPU | `SetGraph` (um Resource), executado pelo `GraphFlow` |

Mudar um valor de parâmetro vale no quadro seguinte, sem recompilar; mudar a ligação dos nós recompila em transição,
sem quadro quebrado. O grafo é dado: pode ser empacotado como nó (sub-grafo) e salvo e lido como JSON.

A arquitetura (compilação, `GraphFlow`, contrato de shader) está em
[Arquitetura — Grafos de nós](./architecture_resource_loaders.md); este guia mostra o uso.

## Grafo de ponto

### Montando

```ts
import { NodeGraph, MaterialFunction, nodes } from 'clayflow';

// Ruído da posição → rampa → cor; o mesmo ruído na rugosidade (ramificação: avaliado uma vez por amostra).
const look = new NodeGraph({
    nodes: {
        s: nodes.input.surfaceSample(),                                  // o argumento `s` do ponto `material`
        n: nodes.noise.gradient3.with({ scale: 4, offset: [0, 0, 0] }),
        c: nodes.color.ramp.with({ color_a: [0.1, 0.1, 0.1], color_b: [0.9, 0.6, 0.2], low: -0.6, high: 0.6 }),
        out: nodes.output.surfaceParams,                                 // entradas sem ligação: as constantes do material
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
app.world.insert(new ParametricSurface({ preset: 'torus', differential: true })
    .add(new StandardMaterial())
    .add(new Transform())
    .add(material));

material.values.n_scale = 8;          // `nó_parâmetro`: quadro seguinte, sem recompilar
material.setGraph(outroGrafo);        // topologia nova: compila em transição; falha mantém a anterior
app.events.on('extensionRejected', (e) => console.warn(e.point, e.message));
```

- **Nós** por id (identificador WGSL): um uso com valores (`def.with({ … })`), a definição com os valores padrão
  (`nodes.output.surfaceParams`), ou um argumento do ponto (`graphArgument`).
- **Ligações** `['origem.porta', 'destino.porta']`: uma entrada recebe no máximo uma; uma saída alimenta quantas
  quiser — e o nó é avaliado **uma vez**.
- **Saída** (`output`): a porta cujo valor a função devolve, convertida ao retorno do ponto.

O grafo é validado na criação — nó ou porta inexistente, duas ligações numa entrada, entrada sem ligação nem padrão,
ciclo (com o caminho) — com `NodeGraphError` síncrono nomeando nós e portas. Tipos e estágio são conferidos ao
compilar para o ponto (na criação da função, ou no `setGraph`).

### Onde ele roda: as funções da 009

Todo ponto de extensão aceita um grafo no lugar do código: `new TransformFunction({ graph })`, `CameraFunction`,
`SurfaceFunction`, `DisplacementFunction`, `SpaceFunction`, `FieldFunction`, `MaterialFunction`, `EmitFunction`. O grafo gera a função do
ponto (com o nome e a assinatura dele), os parâmetros (`nó_parâmetro`, no registro tipado da forma) e os módulos;
validação, pools, troca só quando compila e `extensionRejected` são os da 009 ([Shaders — pontos de
extensão](./shaders.md)). As entradas do ponto são **argumentos** do grafo, pelos nomes da assinatura:

| Ponto | Argumentos (`graphArgument(nome)`) | Retorno |
|---|---|---|
| `transform` | `slot`, `t` (`Transform`), `time` | `mat4x4f` |
| `camera` | `c` (`Camera`), `world`, `aspect`, `time` | `CameraOut` |
| `surface` | `u`, `v`, `time` | `vec3f` |
| `displacement` | `s` (`SurfaceSample`, a do `material`, preenchida para o vértice: uv, posição e normal locais, tangentes do uv e o passo da malha como derivadas do uv) | `f32` (a altura ao longo da normal; saída `surface.displacement`) |
| `space` | `x`, `time` | `vec3f` |
| `field` | `x`, `v`, `time`, `body` (`FieldBody`) | `vec3f` |
| `material` | `s` (`SurfaceSample`), `m` (`StandardMaterial`) | `SurfaceParams` ou `Closure` (saída `output.closure`; ver [Materiais](#materiais-nodesbsdf-nodesclosure-nodesmaterial)) |
| `emit` | `i`, `time`, `seed` | `EmittedParticle` |

`graphArgument(nome, campos?)` dá a porta `value` (o argumento inteiro) e uma porta por campo declarado
(`graphArgument('s', { world_position: 'vec3f' })` → `s.world_position`). Os atalhos da biblioteca são as entradas de
contexto `nodes.input.*` ([Biblioteca](#biblioteca)): `surfaceSample()` (todos os campos de `s`, inclusive `metric`,
`curvature`, `principal` da 010), `material()` (`m.albedo`, `m.roughness`, `m.metallic`), `time()` (o argumento
`time` dos pontos que o têm — no `material`, o tempo é `surfaceSample().time`), `vertexField(…)`, `particle(…)`,
`cell(…)` e `camera(…)`.

Regras da compilação:

- tipos iguais, ou escalar → vetor do mesmo componente por repetição (`f32` → `vec3f`) — o resto é `type-mismatch`;
- nó fora do estágio do ponto é `context` (o `material` é avaliado no fragmento; os outros, em compute);
- entrada sem ligação usa a expressão de `defaults` do nó, no escopo da função (o `output.surfaceParams` usa as
  constantes do material: `m.albedo.rgb`, `m.roughness`…);
- grafo **sem saída** (vazio ou em montagem): a função usa a implementação pronta do ponto, com um aviso único.

### Escrevendo um nó de ponto

Um nó é uma função WGSL num módulo e as portas que a descrevem:

```ts
import { defineNode, wgslModule, wgslLib } from 'clayflow';

const waves = wgslModule({
    name: 'my_waves',
    requires: [wgslLib.noise],
    source: /* wgsl */ `
struct MyWavesOut { height: f32, slope: vec2f }
fn my_waves(p: vec3f, time: f32, amp: f32, freq: f32) -> MyWavesOut {
    let h = amp * sin(freq * p.x + time) * cos(freq * p.z);
    return MyWavesOut(h, vec2f(amp * freq * cos(freq * p.x + time), 0.0));
}`,
});

export const myWaves = defineNode({
    name: 'my.waves',                                      // único no registro
    inputs: { p: 'vec3f', time: 'f32' },                   // na ordem dos parâmetros da função
    outputs: { height: 'f32', slope: 'vec2f' },            // várias saídas: campos do struct de retorno
    params: { amp: { type: 'f32', default: 0.2 }, freq: { type: 'f32', default: 3 } },   // depois das entradas
    defaults: { time: '0.0' },                             // entrada sem ligação
    code: waves,
    fn: 'my_waves',
    contexts: ['fragment', 'vertex', 'compute'],           // padrão: todos (derivadas de tela: só 'fragment')
});
```

`defineNode` confere na criação que a função existe com a assinatura das portas e dos parâmetros
(`node-signature`). O módulo segue as regras de qualquer módulo: sem `@group/@binding` à mão; dependências, recursos
declarados e constantes por `requires`. Parâmetros aceitam `f32`, `u32`, `i32` e os vetores de 2 a 4 componentes de
cada um.

## Grafo de conjunto

### Montando

```ts
import { NodeGraph, SetGraph, GraphGeometry, compileSetGraph, graphArgument, nodes } from 'clayflow';

// grade → deslocar por ruído → recalcular normais → distribuir pontos por densidade → uma esfera por ponto
const scatter = new NodeGraph({
    nodes: {
        g: nodes.set.grid.with({ resolution: [64, 64], size: [4, 4] }),
        p: graphArgument('position'),                                    // argumento das entradas de ponto
        h: nodes.noise.gradient3.with({ scale: 1.5 }),
        d: nodes.set.displace.with({ scale: 0.3 }),
        n: nodes.set.recomputeNormals,
        q: nodes.input.vertexField('position'),
        k: nodes.noise.gradient3.with({ scale: 3, offset: [7, 0, 0] }),
        s: nodes.set.distributeOnMesh.with({ per_triangle: 1, seed: 1 }),
        r: nodes.set.realizeInstances.with({ radius: 0.03, segments: 8, rings: 6 }),
        o: nodes.set.meshOutput,
    },
    links: [
        ['g.mesh', 'd.mesh'],
        ['p.value', 'h.p'],
        ['h.value', 'd.height'],          // grafo de ponto fundido no kernel de `d` — nenhum passe a mais
        ['d.mesh', 'n.mesh'],
        ['n.mesh', 's.mesh'],
        ['q.value', 'k.p'],
        ['k.value', 's.density'],         // densidade por ponto: contagem decidida na GPU
        ['s.points', 'r.points'],
        ['r.mesh', 'o.mesh'],
    ],
});

const graph = new SetGraph({ graph: scatter });
// Capacidades da saída pelo plano (as mesmas que o GraphFlow aloca).
const plan = compileSetGraph(scatter, (id) => graph.valuesOf(id));
const cap = (key: string) => plan.sets.find((s) => s.key === key)!.capacity;
const triangles = cap('r.mesh.triangles');
app.world.insert(
    graph
        .add(new GraphGeometry({ vertexCapacity: cap('r.mesh.vertices'), indexCapacity: triangles * 3 }))
        .add(new StandardMaterial({ albedo: [0.85, 0.55, 0.25, 1] }))
        .add(new Transform()),
);

graph.values.s_seed = 8;               // refeito no quadro seguinte
graph.setGraph(outroGrafo);            // topologia nova: o GraphFlow reconstrói
```

- O grafo de conjunto não tem `output`: o resultado sai pelos nós de saída (`set.meshOutput`, `set.pointsOutput`),
  que escrevem no **alvo** da entidade — a `GraphGeometry`, desenhada pelo forward e pela sombra como qualquer
  geometria. Sem alvo, os nós de saída não gravam nada.
- O `GraphFlow` (registrado pelos estágios padrão, fase `transform`) aloca os conjuntos intermediários e os registros
  de contagem, cria os kernels e grava os nós **só quando algo mudou** (valores, topologia, nó dependente do tempo):
  com a cena parada, nada é refeito.
- Nada é lido de volta: a contagem de `set.distributeOnMesh` segue para `set.realizeInstances` e para o desenho por
  despacho e desenho indiretos.
- Entradas de ponto (`d.height`, `s.density`) aceitam grafos de ponto com os argumentos `position`, `normal` e `uv`
  do elemento, que devolvem `f32`; sem ligação, o padrão da entrada (altura 0, densidade 1).

### Escrevendo um nó de conjunto

Um nó de conjunto declara portas, parâmetros, capacidade e contagem de cada saída, e uma fábrica que cria os kernels
da instância. Exemplo: escalar os vértices de uma malha.

```ts
import {
    defineSetNode, setType, wgslResource, wgslModule, sharedConstant, SetNodeKernels,
    SetCountSchema, SET_GROUP, MeshVertexSchema, StructSchema, FieldType,
} from 'clayflow';
import { MESH, MeshTriangleSchema } from '…/elements/nodes/set/schemas';   // tipo de porta `mesh` da biblioteca

const ScaleParams = new StructSchema('ScaleParams', { vertices_slot: FieldType.u32, factor: FieldType.f32 },
    { addressSpace: 'uniform' });
const GROUP = sharedConstant('SCALE_GROUP', SET_GROUP, 'u32');   // os argumentos indiretos são para grupos de 256

const R = {
    params: wgslResource({ name: 'scale', binding: { uniform: true }, type: { schema: ScaleParams },
        frequency: 'stage', provider: 'private' }),
    counts: wgslResource({ name: 'scale_counts', binding: { storage: 'read' },
        type: { schema: SetCountSchema, array: true }, frequency: 'stage', provider: 'private' }),
    vin: wgslResource({ name: 'scale_in', binding: { storage: 'read' },
        type: { schema: MeshVertexSchema, array: true }, frequency: 'stage', provider: 'private' }),
    vout: wgslResource({ name: 'scale_out', binding: { storage: 'read_write' },
        type: { schema: MeshVertexSchema, array: true }, frequency: 'stage', provider: 'private' }),
};

const scaleShader = wgslModule({
    name: 'my_set_scale',
    requires: [GROUP.module, R.params, R.counts, R.vin, R.vout],
    source: /* wgsl */ `
@compute @workgroup_size(SCALE_GROUP)
fn scale_main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid.x + gid.y * nwg.x * SCALE_GROUP;         // despacho dividido em x/y
    if (i >= scale_counts[scale.vertices_slot].count) { return; }
    let m = scale_in[i];
    scale_out[i] = MeshVertex(m.px * scale.factor, m.py * scale.factor, m.pz * scale.factor, m.nx, m.ny, m.nz, m.u, m.v);
}`,
});

O que a instância possui na GPU fica com `SetNodeKernels` (spec 039, T060g): o uniform dos parâmetros, os buffers
próprios (descritores do Resource de trabalho do `GraphFlow`) e os kernels, preparados pela C2 como pipelines do
`GraphFlow` (cada um com as suas fontes, ligadas só a ele). Nada é criado pelo core.

export const scaleMesh = defineSetNode({
    name: 'my.scaleMesh',
    inputs: { mesh: MESH },
    outputs: { mesh: MESH },
    params: { factor: { type: 'f32', default: 1 } },
    capacity: (c) => ({ 'mesh.vertices': c.input('mesh', 'vertices'), 'mesh.triangles': c.input('mesh', 'triangles') }),
    counts: { 'mesh.vertices': { same: 'mesh.vertices' }, 'mesh.triangles': { same: 'mesh.triangles' } },
    create: (c) => {
        const vin = c.input('mesh', 'vertices');
        const tin = c.input('mesh', 'triangles');
        const tout = c.output('mesh', 'triangles');
        const own = new SetNodeKernels(c, ScaleParams);   // o uniform `params` e os kernels, pela C2
        own.kernel('scale', scaleShader, 'scale_main', [
            [R.params, own.params], [R.counts, c.counts], [R.vin, vin.buffer],
            [R.vout, c.output('mesh', 'vertices').buffer],
        ]);
        return {
            update: () => {                                   // valores novos: fora da gravação
                own.write({ vertices_slot: vin.slot, factor: c.values().factor ?? 1 });
            },
            record: (frame) => {                              // só grava
                own.indirect(frame, 'my.scaleMesh', 'scale', vin.slot);
                frame.copy(tin.buffer, tout.buffer, tout.capacity * MeshTriangleSchema.stride);
            },
            dispose: () => {
                own.dispose();
            },
        };
    },
});
```

- **Portas**: `setType(nome, conjuntos)` — o nome é a identidade nas ligações (`mesh` só liga em `mesh`); cada
  conjunto tem o schema do elemento.
- **Capacidade** de cada conjunto de saída (`'porta.conjunto'` → elementos), pelos valores e pelas entradas; mudou com
  um valor novo, o `GraphFlow` realoca e recria a instância.
- **Contagem**: `'cpu'` (= a capacidade), `'gpu'` (um kernel do nó escreve `count` no registro `SetCount` da saída e
  grava `CountToArgs` para derivar despacho e desenho) ou `{ same: 'porta.conjunto' }` (o registro da entrada).
- **Despacho**: pelo argumento indireto do registro (`setDispatchOffset(slot)`), em grupos de `SET_GROUP` (256),
  lendo a contagem do registro no kernel. `animated: true` refaz o grafo a cada quadro.
- **Entrada de ponto**: `setPointInput(alvo, at, fn)` — o kernel chama `fn` (o ponto `at`, com um pronto); um grafo
  ligado é compilado contra `alvo` e trocado no lugar do pronto (`c.point(porta)` dá o módulo e o uniform dos
  parâmetros dele).
- As primitivas `PrefixSum`, `RadixSort`, `Compaction` e `Reduce` aceitam a contagem da GPU (`{ counts, index }`) —
  é assim que os nós `set.prefixSum`, `set.sort`, `set.compact` e `set.reduce` são feitos.

## Sub-grafos

```ts
import { Subgraph } from 'clayflow';

// Um grafo de ponto como nó: entradas = argumentos do grafo e os expostos; saída = a dele; parâmetros = os expostos.
const wave = Subgraph.point(waveGraph, { name: 'my.wave', inputs: { t: 'f32' }, expose: ['w.amp'] });
const g = new NodeGraph({ nodes: { a: wave.with({ w_amp: 0.5 }), b: wave.with({ w_amp: 2 }), /* … */ }, /* … */ });

// Um grafo de conjunto como nó: expandido no grafo que o usa (`uso_nó`); entradas abertas (`open`) por dentro.
const filter = Subgraph.set(stageGraph, { name: 'my.filter', inputs: { in: 'm.in' }, outputs: { out: 'f.out' } });
```

- **De ponto**: a função do nó é o grafo compilado (`sub_<hash>`), emitida uma vez por shader — usos repetidos
  compartilham o código e o pipeline; os parâmetros não expostos ficam embutidos; os estágios do nó são os comuns aos
  nós de dentro. Cada parâmetro exposto é também uma **entrada** de mesmo nome (spec 011): sem ligação vale o valor do
  uso (`wave.with({ w_amp: 0.5 })`, que muda sem recompilar); ligada, a saída do outro nó
  (`['ruido.value', 'a.w_amp']`). Uma entrada pode ter um **padrão** (`defaults: { s: 's' }`, uma expressão WGSL como
  em `defineNode`): sem ligação vale ela — os materiais prontos com padrão recebem assim a amostra de superfície do
  ponto `material`, sem ligação obrigatória.
- **De conjunto**: os nós de dentro entram no grafo de fora com o prefixo do uso; os valores expostos vêm do uso
  (`filter.with({ nó_parâmetro: v })`); conjuntos e contagens circulam sem cópia.

## Salvar e ler

```ts
import { toJSON, fromJSON, defaultNodeRegistry, NodeRegistry } from 'clayflow';

const json = toJSON(scatter, defaultNodeRegistry);      // { version, nodes, links, output?, open?, subgraphs? }
const again = fromJSON(json, defaultNodeRegistry);      // mesma forma, mesmo código, mesmo pipeline

const mine = new NodeRegistry([...defaultNodeRegistry.names().map((n) => defaultNodeRegistry.get(n)!), myWaves, scaleMesh]);
```

Nós registrados vão pelo nome; nós WGSL fora do registro e sem dependências de módulo vão pelo código; sub-grafos pela
estrutura (o grafo e as opções, uma vez por nome). Na leitura, os nós WGSL do usuário são reconstruídos pelo código e
compartilham o módulo por nome e código: nós que vinham do mesmo módulo voltam a usar um só (e a mesma leitura dá a
mesma definição — mesmo pipeline). Na escrita, nó de conjunto fora do registro, nó WGSL fora do registro com
dependências de módulo (`requires`) e dois sub-grafos diferentes com o mesmo nome são `NodeGraphError`
(`serialization`); na leitura, versão diferente, tipo fora do registro e sub-grafo não declarado. Para serializar grafos
com nós próprios (como o `myWaves` acima, que depende da `wgslLib.noise`), registre-os num `NodeRegistry`.

## Biblioteca

A biblioteca fica na C3, em `src/elements/nodes`, um subdiretório por categoria (`input/`, `math/`, `map/`, `color/`,
`noise/`, `pattern/`, `condition/`, `space/`, `field/`, `surface/`, `geometry/`, `bsdf/`, `closure/`, `output/`,
`material/`, `set/`). É publicada por `nodes` (os nós por categoria) e `defaultNodeRegistry` (todos os nós de ponto e de
conjunto e os sub-grafos de `nodes.material`, para a serialização; `defaultNodeRegistry.names()` lista os disponíveis).
São **98 nós de ponto** (`pointNodes`), 12 de conjunto, os 26 sub-grafos de `nodes.material` (o OpenPBR e os 25
materiais prontos) e as entradas de contexto.

Os nós de ponto valem em todos os estágios, salvo `output.surfaceParams`, `output.closure` e `geometry.tangentUv` (só
`fragment`). Cada um tem a referência da
CPU em `src/elements/nodes/reference` (f64; aritmética inteira u32 exata nos ruídos) e um caso de teste
(`reference/cases.ts`, 128 amostras determinísticas) avaliado pelo teste da biblioteca e, na GPU, pelo smoke
`nodeGraphs`. A **tolerância** é por componente: `|gpu − referência| ≤ tol · max(1, |referência|)`.

### Entradas de contexto (`nodes.input`)

Não são funções: são os argumentos da função do ponto alvo como nós (`graphArgument`), com a porta `value` (o argumento
inteiro) e uma por campo. Uma entrada que o ponto não tem não compila (`target`, nomeando o argumento e os do ponto).

| Entrada | Argumento | Ponto | Portas |
|---|---|---|---|
| `surfaceSample()` | `s` | `material` | `world_position`, `normal`, `uv`, `time`, `metric`, `curvature`, `principal` (geometria diferencial da 010), `footprint`, `duvdx`, `duvdy` (a largura do pixel ou do cone e as derivadas do uv, spec 034), `dpdu`, `dpdv` (as tangentes do uv em mundo: ∂posição/∂u e ∂posição/∂v; zero nos acertos dos raios — spec 011) |
| `worldPosition()` | `s` | `material` | `world_position` |
| `material()` | `m` | `material` | `albedo` (`vec4f`), `roughness`, `metallic` |
| `time()` | `time` | `surface`, `space`, `field`, `transform`, `camera`, `emit` | `value` (`f32`). No `material` o tempo é `surfaceSample().time` |
| `vertexField('position' \| 'normal' \| 'uv')` | o nome | entradas de ponto dos nós de conjunto (`height` de `set.displace`, `density` de `set.distributeOnMesh`) | `value` |
| `particle('x' \| 'v' \| 'body' \| 'i' \| 'seed')` | o nome | `field` (`x`, `v`, `body`: `inv_mass`, `density`, `volume`); `emit` (`i`, `seed`, `u32`) | `value` e os campos de `body` |
| `cell('u' \| 'v')` | o nome | `surface` | `value` (`f32`) |
| `camera('c' \| 'world' \| 'aspect')` | o nome | `camera` | `c`: `projection`, `fov`, `orthoHeight`, `near`, `far`, `aspect`; `world` (`mat4x4f`); `aspect` (`f32`) |

### Matemática (`nodes.math`, 41 nós)

Tipos fixos por nó: sem sufixo, escalar (`f32`); `2`/`3`/`4`, vetor de tantas componentes. Saída `value`, salvo nos
`split*`.

| Nós | Entradas (padrão) | Faz | Tolerância |
|---|---|---|---|
| `math.value`, `value2`, `value3`, `value4` | — (parâmetro `value`) | constante `f32`/`vec2f`/`vec3f`/`vec4f`; muda sem recompilar | 1e-6 |
| `math.add`, `sub` | `a`, `b` (0) | `a + b`, `a − b` | 1e-6 |
| `math.mul`, `div` | `a`, `b` (1) | `a · b`, `a / b` | 1e-6 |
| `math.min`, `max` | `a`, `b` | mínimo, máximo | 1e-6 |
| `math.abs`, `floor`, `fract`, `sqrt` | `x` | as do WGSL | 1e-6 |
| `math.mix` | `a`, `b`, `t` | `mix(a, b, t)` escalar | 1e-6 |
| `math.clamp` | `x`, `low` (0), `high` (1) | `clamp(x, low, high)` | 1e-6 |
| `math.smoothstep` | `edge0` (0), `edge1` (1), `x` | `smoothstep` | 1e-5 |
| `math.pow` | `x`, `e` (2) | `pow(x, e)` | 1e-4 |
| `math.sin`, `cos` | `x` | — | 5e-4 |
| `math.tan` | `x` | — | 4e-3 |
| `math.atan2` | `y`, `x` | `atan2(y, x)` | 5e-4 |
| `math.add3`, `sub3` | `a`, `b` (`vec3f(0)`) | por componente | 1e-6 |
| `math.mul3`, `div3` | `a`, `b` (`vec3f(1)`) | por componente | 1e-6 |
| `math.scale3` | `v`, `s` (1) | `v · s` | 1e-6 |
| `math.mix3` | `a`, `b` (`vec3f`), `t` (`f32`) | `mix(a, b, t)` em `vec3f` | 1e-6 |
| `math.dot`, `distance` | `a`, `b` | escalar | 1e-5 |
| `math.cross` | `a`, `b` | `vec3f` | 1e-5 |
| `math.normalize`, `length` | `v` | — | 1e-5 |
| `math.toFloat` | `x` (`u32`) | `f32(x)` | 1e-6 |
| `math.toUint` | `x` (`f32`) | `u32`, truncado e preso em 0 | 1e-6 |
| `math.split2`, `split3`, `split4` | `v` | saídas `x`, `y` (`z`, `w`) | 1e-6 |
| `math.combine2`, `combine3`, `combine4` | `x`, `y` (`z`, `w`) | o vetor | 1e-6 |

### Mapeamentos e rampas (`nodes.map`, `nodes.color`)

| Nó | Entrada → saída | Parâmetros (padrão) | Faz | Tolerância |
|---|---|---|---|---|
| `map.range` | `x` → `value` | `in_min` (0), `in_max` (1), `out_min` (0), `out_max` (1), `clamped` (`u32`, 1) | linear de `[in_min, in_max]` para `[out_min, out_max]`; presa com `clamped` ≠ 0; faixa vazia tratada como 1e-6 | 1e-5 |
| `map.curve4` | `x` → `value` | `p0`…`p3` (`vec2f`; a identidade em [0, 1]) | linear por trecho pelos pontos (x crescente), constante fora | 1e-5 |
| `color.ramp` | `t` → `color` (`vec3f`) | `color_a` (preto), `color_b` (branco), `low` (0), `high` (1) | `color_a` em `low` a `color_b` em `high`, presa nos extremos | 1e-5 |
| `color.ramp4` | `t` → `color` | `stop0`…`stop3` (`vec4f`: cor em `rgb`, posição em `w`; preto, vermelho, amarelo, branco em 0, ⅓, ⅔, 1) | linear por trecho, presa nos extremos | 1e-5 |
| `color.rgb` | `r`, `g`, `b` → `value` (`vec3f`) | as entradas, com valor ou ligação | a cor das componentes | 1e-5 |
| `color.hsv` | `h`, `s`, `v` → `value` (`vec3f`) | as entradas | cor de matiz (voltas em [0, 1)), saturação e valor | 1e-5 |
| `color.temperature` | `kelvin` → `value` (`vec3f`) | `kelvin` (6500) | cor de corpo negro de 1000 a 40000 K, normalizada no máximo 1 | 2e-3 |
| `color.luminance` | `c` (`vec3f`) → `value` (`f32`) | — | luminância Rec. 709 de uma cor linear | 1e-5 |

Padrões (`nodes.pattern`, spec 038): `pattern.checker2` (`p`: `vec2f`) e `pattern.checker3` (`p`: `vec3f`), o xadrez
avaliado por pixel na GPU sobre `p · scale + offset`, filtrado pela largura `width` (ex.: `s.footprint`; 0 = exato),
saída em [0, 1] para uma rampa de cor; tolerância 1e-4.

Padrões com relevo (`nodes.pattern`, spec 011) — a estrutura dos materiais prontos, calculada por pixel. Todos recebem a
coordenada `p` (`vec2f`), a largura do pixel nela (`width`) e o período dela (`wrap`, `vec2f`; 0 = sem) — as saídas `p`,
`width` e `wrap` de `surface.uvSpace` — e devolvem, além dos valores, o **gradiente** da altura (`gradient`, `vec2f`:
∂/∂p, analítico), a entrada de `surface.bump` e de `surface.relief`. O detalhe menor que o pixel vai à média (some a
partir de meia célula por pixel) e o gradiente a zero; com `wrap`, a frequência é ajustada a um número inteiro de
células por período e o padrão fecha sem emenda onde o uv dá a volta. Tolerância 2e-3 (`pattern.threshold`: 1e-4).

| Nó | Parâmetros (padrão) | Saídas |
|---|---|---|
| `pattern.weave` | `scale` (fios por unidade), `over` 1, `under` 1, `shift` 1 (o ligamento: a urdidura passa `over` fios por cima e `under` por baixo, deslocada `shift` a cada fio — tela 1/1/1, sarja do jeans 3/1/1, cetim 4/1/2), `gap` 0,1 (fração do passo sem fio), `seed`, `twist` 0 (rad: o ângulo da hélice das fibras em torno do eixo do fio) | `height` em [0, 1], `gradient`, `warp` (1 onde o fio à vista é de urdidura, ao longo de `p.y`; 0 de trama), `thread` (valor em [0, 1] do fio à vista), `gap` (1 no vão entre os fios), `fiber` (`vec2f`: a direção em `p` da fibra do fio à vista — o eixo do fio girado pela torção, inteira no meio do fio e nula nas bordas; por `surface.direction`, a tangente do brilho anisotrópico) |
| `pattern.knit` | `scale` (colunas de pontos por unidade de `p.x`), `aspect` 1,4 (carreiras por coluna: `scale` · `aspect` carreiras por unidade de `p.y`), `thickness` 1 (a meia largura do fio é 0,2 · `thickness` da coluna), `seed`, `twist` 0 | o tricô em ponto meia (pontos em V: duas pernas de fio por ponto, que sobem do meio da coluna para as bordas e passam por baixo da carreira de cima): `height` em [0, 1], `gradient`, `fiber` (a direção da fibra à vista, como na trama), `stitch` (valor em [0, 1] do ponto), `gap` (1 no fundo entre os fios) |
| `pattern.cells` | `scale` (células por unidade), `jitter` 1, `crease` 0,1 (largura do sulco, em células), `seed` | `height` = smoothstep(0, `crease`, distância à borda) — 0 no sulco, 1 no platô —, `gradient`, `cell` (valor em [0, 1] da célula), `random` (`vec2f` em [-1, 1] da célula: a inclinação de um floco) |
| `pattern.rings` | `scale` 8 (anéis por unidade de raio), `depth` 0,3 (da medula ao plano do corte), `distortion` 0,15 e `distortion_scale` (1,5; 0,75) (o ruído que varia a profundidade do corte), `seed`, `irregularity` 0 (0 a 1: a largura varia de ano para ano), `waviness` 0 e `waviness_scale` (3; 12) (a ondulação do raio pelo ruído, em unidades de `p`) | `value` em [0, 1] (do lenho inicial ao tardio; a fibra corre ao longo de `p.x`, a medula em `p.y` = 0), `gradient`, `ring` (valor em [0, 1] do anel); `knot` (o miolo do nó da madeira em [0, 1]). Os nós: `knots` 0 (células por unidade de `p`; um nó em três de cada dez células; 0 = sem), `knot_size` 0,04 (a meia largura do nó em `p`) e `knot_rings` 6 (quantos anéis o nó soma ao raio): os anéis desviam em volta do nó e fecham em voltas dentro dele |
| `pattern.grain` | `scale` (`vec2f`, frequência por eixo: (2, 200) dá riscos ao longo de `p.x`), `octaves` 3 (1 a 8), `lacunarity` 2, `gain` 0,5, `seed` | `value` em [-1, 1], `gradient` |
| `pattern.brush` | `scale` (2; 200) (`vec2f`: riscos por unidade de `p` ao longo e através, na primeira das quatro passadas), `spread` 0,06 (rad: quanto a direção dos riscos varia de lugar para lugar), `bend_scale` (1,5; 3) (ondas por unidade do ruído que desvia os riscos), `deep` 0,1 (a fração das células com um risco fundo isolado), `seed` | a escova de um metal: `value` (os riscos finos em [-1, 1] menos os fundos, até −1,8), `gradient`, `direction` (`vec2f`, a direção dos riscos em `p` no ponto — a tangente do lobo anisotrópico, por `surface.direction`), `deep` (o risco fundo em [0, 1]) |
| `pattern.bricks` | `scale` (1; 2) (peças por unidade de `p.x`, fiadas por unidade de `p.y`), `shift` 0,5 (o deslocamento de cada fiada, em peças: 0,5 a amarração do tijolo, 0 a grade do azulejo), `gap` 0,1 e `bevel` 0,08 (a junta e a aresta arredondada, em frações da altura da fiada), `seed` | `height` (0 na junta, 1 na face), `gradient`, `brick` (valor em [0, 1] da peça), `mortar` (1 na junta) |
| `pattern.planks` | `scale` 4 (larguras de tábua por unidade), `length` 6 (comprimento da peça, em larguras, inteiro), `arrangement` 0 (0: réguas em fileiras deslocadas ao acaso; 1: espinha de peixe), `gap` 0,02, `bevel` 0,04 (em larguras), `seed` | `p` (`vec2f`: a coordenada dentro da peça, o comprimento ao longo de x, com um deslocamento próprio de cada peça — liga na entrada `p` de `pattern.rings` e `pattern.grain`: cada tábua com os seus anéis, na sua direção), `height`, `gradient`, `plank` (valor em [0, 1] da peça), `joint` (1 na junta) |
| `pattern.fissures` | `scale` (4; 1) (`vec2f`: placas por unidade de `p.x` e de `p.y` — placas alongadas no eixo de menor frequência), `jitter` 1, `crease` 0,2 (a largura da fissura, em células do eixo de maior frequência: a mesma em `p` em qualquer direção), `seed` | a casca de árvore: `height` (0 no fundo da fissura, 1 na face da placa), `gradient`, `plate` (valor em [0, 1] da placa); as fissuras formam uma rede que se ramifica e se junta |
| `pattern.dents` | `scale` (mossas por unidade), `jitter` 1, `seed` | o metal martelado: `height` = 2 · d² presa em 1 (d a distância ao ponto da célula: o fundo da calota no ponto, a aresta viva onde duas mossas se encontram), `gradient`, `cell` |
| `pattern.shingles` | `scale` (2; 4) (`vec2f`, também entrada: telhas por unidade de `p.x` e fiadas por unidade de `p.y`; negativo em y: o pé das telhas para o lado de `p.y` maior), `shift` 0,5 (o deslocamento de cada fiada, em telhas: 0,5 as juntas desencontradas, 0 as colunas da telha de capa e canal), `gap` 0,04 e `bevel` 0,08 (o vão lateral e a borda arredondada, em alturas de fiada), `profile` 0 (0 a 1: a fração da altura que vem do perfil de capa e canal), `irregularity` 0 (o recuo do pé de cada telha, ao acaso), `seed` | as fiadas sobrepostas do telhado: `height` em [0, 1] — a telha é um plano inclinado, grossa no pé e enfiada sob a fiada de cima; no degrau do pé desce à telha de baixo (o dente de serra que faz a sombra) —, `gradient`, `tile` (valor em [0, 1] da telha à vista), `gap` (1 onde a que se vê é a de baixo), `along` (a posição na fiada: 0 no pé, 1 no topo) |
| `pattern.veins` | `scale` (0,5; 1) (`vec2f`: lâminas por unidade de `p.x`, o comprimento, e de `p.y`, a largura), `veins` 7 (secundárias de cada lado por lâmina), `slope` 1 (a tangente do ângulo com a central), `curve` 1 (a curva para a ponta), `thickness` 0,03 (meia largura da central na base, em larguras da lâmina), `fine` 30 (aréolas por unidade; 0: sem vênulas), `seed`, `irregular` 0 (0 a 0,35: o espaçamento e o ângulo das secundárias variam), `taper` 0 (0 a 1: quanto a central afina até a ponta), `ladder` 0 (terciárias por largura de lâmina, em escada entre duas secundárias) | as nervuras da folha: `height` em [0, 1] (1 na central, 0,7 nas secundárias, 0,4 nas terciárias, 0,35 nas vênulas — as bordas arredondadas das aréolas —, 0 no limbo), `gradient`, `main` (a central, as secundárias e, a 0,5, as terciárias), `across` (a distância à central: 0 nela, 1 na margem), `cell` (valor em [0, 1] da aréola, indo a 0,5 na borda) |
| `pattern.areoles` | `scale` 1 (células por unidade), `jitter` 0,8 (até 0,8), `wall` 0,25 (a largura da borda, em fração da meia célula), `seed` | células arredondadas (as almofadas do limbo de uma folha, bolhas, seixos): a posição na célula é 2 · d₁ / (d₁ + d₂), das distâncias aos dois pontos mais próximos — curvas de nível circulares, sem as arestas retas do Voronoi. `height` (a almofada abaulada: 1 no meio, 0 na borda), `gradient`, `cell` (valor em [0, 1], indo a 0,5 na borda), `wall` (a borda em [0, 1]) |
| `pattern.glints` | `scale` (flocos por unidade, por lado), `seed` | as células do sorteio dos brilhos pontuais — a entrada de `closure.glints`: `cells` (`vec3f`: o valor em [0, 1] da célula do pixel em dois níveis de detalhe e a mistura entre eles) e `count` (o número de flocos na célula do primeiro nível; 0 com os flocos resolvidos ou sem a largura do pixel) |
| `pattern.threshold` | entradas `value` e `gradient` (de outro padrão); `low` 0, `high` 1 | `value` = smoothstep(`low`; `high`; valor) e o `gradient` pela regra da cadeia: recorta uma faixa de um padrão sem perder a derivada (a fresta onde um grão passa de um nível, a crista do anel); `low` > `high` inverte |

```ts
// Uma sarja com relevo: o espaço do padrão no uv, a trama, a cor pelos dois fios e a normal pelo gradiente.
const twill = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            uv: nodes.surface.uvSpace.with({ scale: [2, 1] }), // numa esfera: o padrão quadrado no equador
            weave: nodes.pattern.weave.with({ scale: 120, over: 3, under: 1 }),
            yarn: nodes.color.ramp.with({ color_a: [0.3, 0.3, 0.35], color_b: [0.03, 0.05, 0.13] }),
            fibers: nodes.bsdf.diffuse.with({ roughness: 1 }),
            relief: nodes.surface.bump.with({ strength: 0.003 }),
            shaped: nodes.closure.normal,
            out: nodes.output.closure,
        },
        links: [
            ['uv.p', 'weave.p'],
            ['uv.width', 'weave.width'],
            ['uv.wrap', 'weave.wrap'],
            ['weave.warp', 'yarn.t'],
            ['yarn.color', 'fibers.color'],
            ['uv.du', 'relief.du'],
            ['uv.dv', 'relief.dv'],
            ['weave.gradient', 'relief.gradient'],
            ['fibers.value', 'shaped.c'],
            ['relief.value', 'shaped.normal'],
            ['shaped.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});
```

### Ruídos (`nodes.noise`)

Sobre a `wgslLib.noise`, na posição `p · scale + offset`. Parâmetros comuns: `scale` (1), `offset` (`vec2f`/`vec3f`, 0)
e `seed` (`u32`, 0 = o ruído da biblioteca; a semente desloca a célula em aritmética inteira u32 — mesma semente, mesma
saída na GPU e na CPU). Tolerância 1e-5 em todos.

| Nó | Entrada | Saídas | Parâmetros próprios |
|---|---|---|---|
| `noise.value2`, `noise.gradient2` | `p` (`vec2f`) | `value` em [−1, 1] | — |
| `noise.value3`, `noise.gradient3` | `p` (`vec3f`) | `value` em [−1, 1] | — |
| `noise.cellular3` | `p` (`vec3f`) | `f1`, `f2` (distâncias ao ponto mais próximo e ao segundo), `cell` (valor em [0, 1] da célula mais próxima) | `jitter` (1; 0 = grade regular) |
| `noise.fbm3` | `p` (`vec3f`) | `value` em [−1, 1] (normalizado pela soma das amplitudes) | `octaves` (`u32`, 5; 1 a 12), `lacunarity` (2), `gain` (0,5); semente + k na oitava k |

### Condições (`nodes.condition`)

| Nó | Entradas → saída | Faz | Tolerância |
|---|---|---|---|
| `condition.compare` | `a`, `b` (0) → `value` | 1,0 verdadeiro, 0,0 falso; parâmetros `op` (`compareOps`: `less` — padrão —, `lessEqual`, `greater`, `greaterEqual`, `equal`, `notEqual`; muda sem recompilar) e `epsilon` (1e-6, a igualdade) | 1e-6 |
| `condition.select` | `if_false`, `if_true`, `condition` → `value` | `if_true` com `condition` > 0,5, senão `if_false` (`f32`) | 1e-6 |
| `condition.select3` | idem, `vec3f` | a mesma escolha em `vec3f` | 1e-6 |

`compareOps` é exportado com os códigos (`nodes.condition.compare.with({ op: compareOps.greater })`).

### Conversões de espaço (`nodes.space`)

A matriz é uma entrada (`m`, `mat4x4f`): a matriz de mundo da entidade, a vista ou a projeção — um argumento do ponto
(`camera('world')`) ou a saída de outro nó. Objeto → mundo: a matriz de mundo; mundo → objeto: `space.inverse` dela.
Tolerância 1e-5 em todos.

| Nó | Entradas → `value` | Faz |
|---|---|---|
| `space.point` | `m`, `p` | `(m · (p, 1)).xyz` |
| `space.direction` | `m`, `d` | `(m · (d, 0)).xyz` |
| `space.normal` | `m`, `n` | a inversa transposta da parte 3×3 aplicada a `n`, normalizada |
| `space.inverse` | `m` → `mat4x4f` | inversa afim `[R \| t]⁻¹ = [R⁻¹ \| −R⁻¹·t]` (última linha (0, 0, 0, 1)) |
| `space.project` | `m`, `p` | `clip.xyz / clip.w` (NDC) |

### Campo da cena (`nodes.field`)

`field.sample` — entradas `x` (`vec3f`), `v` (padrão 0), `time` (padrão 0); parâmetros do corpo `inv_mass` (1),
`density` (0), `volume` (0); saída `value`: a aceleração (m/s²) dos campos da cena, os prontos e as funções `field`. É o
ponto de cena `field`: a C2 compõe os campos em todo shader que usa o nó. **Não use dentro de uma função `field`**
(chamaria a si mesma). Tolerância 1e-4.

### Geometria diferencial (`nodes.surface`)

Sobre os campos `metric`, `curvature`, `principal` e `normal` de `surfaceSample()` (spec 010; zeros nas geometrias sem
geometria diferencial).

| Nó | Entradas → saídas | Tolerância |
|---|---|---|
| `surface.metric` | `metric` → `e`, `f`, `g`, `area` = √(EG − F²) | 1e-5 |
| `surface.curvature` | `curvature` (K, H, k₁, k₂) → `gaussian`, `mean`, `k1`, `k2`, `curvedness` = √((k₁² + k₂²)/2), `shape_index` = (2/π)·atan2(k₁ + k₂, k₁ − k₂) | 1e-5 (`shape_index`: 5e-4) |
| `surface.principal` | `principal`, `normal` → `d1` (direção de k₁ no plano tangente, normalizada), `d2` = n × d₁; zeros em ponto umbílico | 1e-5 |
| `surface.uvSpace` | `uv`, `duvdx`, `duvdy`, `dpdu`, `dpdv` (sem ligação: os da amostra), `scale` (`vec2f`, repetições por unidade de uv; (1, 1)); parâmetro `offset` → `p` = uv · `scale` + `offset`, `width` (a largura do pixel em `p`), `du`, `dv` (as tangentes de `p` em mundo), `wrap` (o período de `p` numa volta do uv) — o espaço dos padrões com relevo (spec 011) | 1e-5 |
| `surface.bump` | `normal` (sem ligação: a da amostra), `du`, `dv`, `gradient` (`vec2f`, de um padrão), `strength` (1; a altura em unidades de `p`: o relevo acompanha o tamanho do padrão, não o do objeto) → `value`: a normal perturbada pelo gradiente de superfície (Mikkelsen 2020); liga no `closure.normal`, ou na `normal` de outro `surface.bump` para somar dois relevos. Sem tangentes (os acertos dos raios), a normal sem mudança | 1e-4 |
| `surface.relief` | `value`, `gradient` (a altura de um padrão e a derivada ∂/∂p), `wrap` (a de `surface.uvSpace`: a escala do padrão no uv), `height` (1; milímetros de uma unidade do padrão — entrada com valor); parâmetro `level` (0: o nível do padrão que fica na superfície) → `value` (`vec3f`): o relevo — a altura em **milímetros** e as derivadas dela no uv. Relevos somam-se com `math.add3` | 1e-5 |
| `surface.reliefNormal` | `normal`, `dpdu`, `dpdv` (sem ligação: os da amostra), `relief` (de `surface.relief`), `scale` (1; unidades do mundo por metro) → `value`: a normal da superfície deslocada pelo relevo (a inclinação presa em 76°); liga no `closure.normal`. Sem tangentes, a normal sem mudança | 1e-4 |
| `surface.displacement` | `relief`, `scale` (1; unidades do mundo por metro) → `value` (`f32`): a altura nas unidades do mundo — a saída do ponto `displacement` (a `DisplacementFunction` de uma `ParametricSurface`) | 1e-6 |
| `surface.direction` | `du`, `dv` (de `surface.uvSpace`), `direction` (`vec2f`, uma direção em `p`: a saída `fiber` de `pattern.weave`/`pattern.knit`) → `value`: a direção em mundo, normalizada — a `tangent` de um especular anisotrópico. Sem tangentes, zero | 1e-4 |

O relevo em milímetros é uma função de altura para dois consumidores: no material, `surface.reliefNormal` inclina a
normal por pixel; na geometria, a `DisplacementFunction` da entidade (o mesmo sub-grafo ligado a
`surface.displacement`) move os vértices da `ParametricSurface`. Os relevos dos materiais prontos são os sub-grafos
`nodes.relief.*` (`woodRough`, `leather`, `wool`): entrada `s` (a amostra), saída o relevo — ver
[Materiais — relevo e deslocamento](./materials.md).

```ts
// Um relevo próprio: sulcos de células de 0,4 mm, na normal e na geometria.
const grooves = Subgraph.point(
    new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            uv: nodes.surface.uvSpace.with({ scale: [2, 1] }),
            cells: nodes.pattern.cells.with({ scale: 40, crease: 0.4 }),
            out: nodes.surface.relief.with({ height: 0.4, level: 1 }), // os sulcos descem dos platôs
        },
        links: [
            ['uv.p', 'cells.p'],
            ['uv.width', 'cells.width'],
            ['uv.wrap', 'cells.wrap'],
            ['cells.height', 'out.value'],
            ['cells.gradient', 'out.gradient'],
            ['uv.wrap', 'out.wrap'],
        ],
        output: 'out.value',
    }),
    { name: 'relief.grooves', inputs: { s: 'SurfaceSample' }, defaults: { s: 's' } },
);
// Na geometria: a função de deslocamento da entidade de uma ParametricSurface (cena em metros: scale 1).
entity.add(
    new DisplacementFunction({
        graph: new NodeGraph({
            nodes: { relief: grooves, out: nodes.surface.displacement },
            links: [['relief.value', 'out.relief']],
            output: 'out.value',
        }),
    }),
);
// No material: o mesmo `grooves` → `surface.reliefNormal` → `closure.normal`.
```

### Saída (`nodes.output`)

`output.surfaceParams` — a saída do ponto `material` (`SurfaceParams`), só em `fragment`: entradas `base_color`,
`alpha`, `roughness`, `metallic`, `emissive`; sem ligação, as constantes do material (`m.albedo.rgb`, `m.albedo.a`,
`m.roughness`, `m.metallic`, emissão 0), como a função pronta. Tolerância 1e-6.

`output.closure` — a saída de fechamento do ponto `material` (`Closure`, spec 011), só em `fragment`: entrada `closure`;
sem ligação, o fechamento pronto das constantes do material da entidade. Tolerância 1e-5.

### Materiais (`nodes.bsdf`, `nodes.closure`, `nodes.material`)

Os materiais por nós da spec 011 estão no motor: uma `MaterialFunction` com um `NodeGraph` cuja saída é
`output.closure` compõe lobos de espalhamento, camadas e o OpenPBR como sub-grafo. Toda entrada de um nó `bsdf.*` ou
`closure.*` aceita um valor (o parâmetro de mesmo nome, que muda sem recompilar) ou uma ligação. Cada nó de lobo tem a
marca `lobe:<nome>`; a `MaterialFunction` une as marcas do grafo em `lobeMask` e o shader do material é especializado só
com esses lobos — mudar valores não recompila, mudar ligações recompila. Referência da CPU em
`src/elements/nodes/reference/material.ts`, tolerância 1e-5.

| Nó | Faz |
|---|---|
| `bsdf.diffuse` | difuso (Oren-Nayar energético; `roughness` 0 = Lambert) |
| `bsdf.conductor` | metal: `color` (F0), `edge_tint` (F82), `roughness`, `anisotropy`, `tangent` |
| `bsdf.dielectric` | reflexão dielétrica por `ior`, `tint`, `roughness`, `anisotropy`; o que não reflete segue aos lobos de baixo |
| `bsdf.transmission` | refração do que está atrás: `ior`, `color` a `depth` (Beer-Lambert), `abbe` (dispersão), `roughness` |
| `bsdf.translucent` | parede fina translúcida, sem refratar o fundo |
| `bsdf.sheen` | brilho de fibra (veludo) |
| `bsdf.subsurface` | subsuperfície (perfil de Burley): `color` (albedo), `radius` por canal em mm, `scale` (unidades por metro) |
| `bsdf.emission` | `color` × `luminance` em nits |
| `closure.mix` | mistura `a` e `b` por `t` |
| `closure.add` | soma os lobos (um dielétrico fica sobre o difuso) |
| `closure.layer` | verniz: o dielétrico de `top` sobre `base`, com `top_color` e `top_weight` |
| `closure.thinFilm` | filme fino (iridescência): `thickness` em nm, `ior` |
| `closure.glints` | brilhos pontuais do especular de base: `cells` e `count` (de `pattern.glints`) e `roughness` 0,1 (a do espelho de cada floco) — a contagem discreta dos flocos alinhados com cada luz no lugar da densidade média do lobo |
| `closure.opacity` | recorte parcial `alpha`: o material vai ao passe dos transmissivos |
| `closure.normal` | normal própria dos lobos de base |
| `closure.mediumPriority` | prioridade do meio na sobreposição de volumes transmissivos |
| `closure.thinWalled` | a transmissão como parede fina (vidraça, bolha) |
| `geometry.tangentUv` | tangente pelo uv (derivadas de tela), para o anisotrópico em malhas sem tangente; só `fragment` |
| `material.openpbr` | o OpenPBR Surface 1.1 como sub-grafo de ponto (`Subgraph.point`) montado com os nós acima; parâmetros com os nomes da norma |
| `material.<nome>` | os 26 materiais prontos (`woodRaw`, `woodRough`, `woodVarnishedGloss`, `velvet`, `metalBrushed`, `carPaint`, `glass`, `skin`…): sub-grafos de ponto com valores físicos e parâmetros expostos — [Materiais](./materials.md#biblioteca-de-materiais-prontos-materials-nodesmaterial) |

```ts
import { MaterialFunction, NodeGraph, nodes } from 'clayflow';

// Madeira envernizada: difuso sob um dielétrico em camada.
const varnished = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            wood: nodes.bsdf.diffuse.with({ color: [0.45, 0.28, 0.15] }),
            coat: nodes.bsdf.dielectric.with({ ior: 1.5, roughness: 0.08 }),
            l: nodes.closure.layer.with({ top_color: [1, 0.85, 0.6] }),
            out: nodes.output.closure,
        },
        links: [
            ['coat.value', 'l.top'],
            ['wood.value', 'l.base'],
            ['l.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});
varnished.lobeMask;               // difuso | especular | anisotropia | verniz — os lobos do shader
varnished.values.wood_color = [0.6, 0.35, 0.2]; // quadro seguinte, sem recompilar

// O OpenPBR como nó: pintura de carro.
const paint = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            pbr: nodes.material.openpbr.with({ base_color: [0.6, 0.02, 0.02], coat_weight: 1, coat_roughness: 0.03 }),
            out: nodes.output.closure,
        },
        links: [['pbr.value', 'out.closure']],
        output: 'out.value',
    }),
});
```

A função também pode ser escrita em WGSL com retorno `Closure` (`new MaterialFunction({ code, lobes })`, os lobos
declarados especializam o shader). Os parâmetros do OpenPBR, os materiais transmissivos e a forma em código estão em
[Materiais](./materials.md); vidro e água em [Refração](./refraction.md).

### Nós de conjunto (`nodes.set`)

Em `src/elements/nodes/set/`: malha (`grid`, `displace`, `recomputeNormals`), pontos (`distributeOnMesh`,
`realizeInstances`), as primitivas paralelas sobre conjuntos u32 (`sequence`, `prefixSum`, `sort`, `compact`, `reduce`)
e as saídas (`meshOutput`, `pointsOutput`). Tipos de porta: `mesh` (vértices `MeshVertex` + triângulos), `points`,
`u32s`.

| Nó de conjunto | Faz | Contagem |
|---|---|---|
| `set.grid` | grade `resolution` (nu × nv) de extensão `size` no plano y = 0, normal +y, uv em [0, 1]² | CPU |
| `set.displace` | cada vértice anda `scale · height(position, normal, uv)` ao longo da normal (entrada de ponto `height`) | a da entrada |
| `set.recomputeNormals` | média normalizada das normais das faces adjacentes, soma em ponto fixo (determinística) | a da entrada |
| `set.distributeOnMesh` | até `per_triangle` candidatos por triângulo, aceitos pela densidade (entrada de ponto `density`, `seed`); compactação estável | GPU |
| `set.realizeInstances` | uma esfera UV (`radius`, `segments`, `rings`) por ponto | GPU (dos pontos) |
| `set.sequence` | `start + i · step`, `i < count` | CPU |
| `set.prefixSum` | soma de prefixos exclusiva (ou `inclusive`) | a da entrada |
| `set.sort` | ordenação radix estável dos `bits` menos significativos | a da entrada |
| `set.compact` | índices dos elementos não nulos, em ordem | GPU |
| `set.reduce` | soma, mínimo ou máximo (`op` 0, 1, 2) a um valor | CPU (1) |
| `set.meshOutput` | a malha na `GraphGeometry` alvo (vértices, índices, arame, registro indireto) | — |
| `set.pointsOutput` | os pontos como vértices da `GraphGeometry` alvo, para sprites | — |

## Erros

`NodeGraphError` (síncrono, com `kind` e `detail` nomeando nós e portas):

| `kind` | Causa |
|---|---|
| `node-signature` | definição inválida: função ausente ou com assinatura diferente das portas; valor para parâmetro desconhecido; nome repetido no registro |
| `unknown-node`, `unknown-port` | ligação ou saída que cita nó ou porta inexistente |
| `duplicate-link` | duas ligações na mesma entrada |
| `unconnected-input` | entrada sem ligação nem padrão (ou entrada de conjunto sem ligação nem `open`) |
| `type-mismatch` | tipos incompatíveis; conjunto ligado em ponto ou de outro tipo |
| `cycle` | ciclo, com o caminho |
| `context` | nó fora do estágio do ponto |
| `target` | argumento que o ponto não tem; nó de conjunto num grafo de ponto; grafo de conjunto sem nó de conjunto ou com `output`; capacidade inválida |
| `serialization` | versão, tipo fora do registro, sub-grafo não declarado (`fromJSON`); nó de conjunto ou nó WGSL com dependências fora do registro, sub-grafos diferentes com o mesmo nome (`toJSON`) |

Erros de compilação do WGSL gerado chegam como `extensionRejected` (grafos de ponto): a função anterior — ou a
pronta — continua.

## Limites desta versão

- Autoria por código; o JSON abre caminho para um editor visual, que não é desta spec.
- Materiais por nós (fechamentos, camadas, OpenPBR como sub-grafo) já existem ([Materiais](#materiais-nodesbsdf-nodesclosure-nodesmaterial));
  texturas procedurais em compute são da 012; a biblioteca de geometria (subdividir, curvas, L-systems), da 032; física
  por nós, da F5.
- Pendências abertas da 031 estão em `specs/PENDENCIAS.md`.
