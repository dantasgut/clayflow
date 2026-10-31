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
`SurfaceFunction`, `SpaceFunction`, `FieldFunction`, `MaterialFunction`, `EmitFunction`. O grafo gera a função do
ponto (com o nome e a assinatura dele), os parâmetros (`nó_parâmetro`, no registro tipado da forma) e os módulos;
validação, pools, troca só quando compila e `extensionRejected` são os da 009 ([Shaders — pontos de
extensão](./shaders.md)). As entradas do ponto são **argumentos** do grafo, pelos nomes da assinatura:

| Ponto | Argumentos (`graphArgument(nome)`) | Retorno |
|---|---|---|
| `transform` | `slot`, `t` (`Transform`), `time` | `mat4x4f` |
| `camera` | `c` (`Camera`), `world`, `aspect`, `time` | `CameraOut` |
| `surface` | `u`, `v`, `time` | `vec3f` |
| `space` | `x`, `time` | `vec3f` |
| `field` | `x`, `v`, `time`, `body` (`FieldBody`) | `vec3f` |
| `material` | `s` (`SurfaceSample`), `m` (`StandardMaterial`) | `SurfaceParams` |
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
    defineSetNode, setType, wgslResource, wgslModule, sharedConstant, createComputeKernel, destroyComputeKernel,
    setDispatchOffset, SetCountSchema, SET_GROUP, MeshVertexSchema, StructSchema, FieldType,
    type UniformBufferSpec,
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

> **Em migração (spec 039, T141).** Os parâmetros e os kernels de um nó de conjunto passam a ser descritores do
> Resource de trabalho do `GraphFlow` (o `SetGraph` declara o que cada nó pede); o `create` deixa de usar `c.core` para
> criar, escrever e destruir. O exemplo abaixo mostra a forma atual e será refeito com a migração.

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
        const params = c.core.create<UniformBufferSpec>({ kind: 'buffer', subkind: 'uniform',
            discriminator: `${c.id}:params`, byteSize: Math.max(16, ScaleParams.stride) });
        const kernel = createComputeKernel(c.core, {
            discriminator: `${c.id}:scale`, shader: scaleShader, entryPoint: 'scale_main',
            bindings: new Map([[R.params, params], [R.counts, c.counts], [R.vin, vin.buffer],
                [R.vout, c.output('mesh', 'vertices').buffer]]),
        });
        return {
            update: () => {                                   // valores novos: fora da gravação
                c.core.write(params, ScaleParams.pack({ vertices_slot: vin.slot, factor: c.values().factor ?? 1 }));
            },
            record: (frame) => {                              // só grava
                frame.compute('my.scaleMesh', (pass) => {
                    pass.bind.setPipeline(kernel.pipeline);
                    kernel.bindTo(pass.bind);
                    pass.dispatch.workgroupsIndirect(c.counts, setDispatchOffset(vin.slot));
                });
                frame.copy(tin.buffer, tout.buffer, tout.capacity * MeshTriangleSchema.stride);
            },
            dispose: () => {
                destroyComputeKernel(c.core, kernel);
                c.core.destroy(params);
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

// Um grafo de ponto como nó: entradas = argumentos do grafo; saída = a dele; parâmetros = os expostos.
const wave = Subgraph.point(waveGraph, { name: 'my.wave', inputs: { t: 'f32' }, expose: ['w.amp'] });
const g = new NodeGraph({ nodes: { a: wave.with({ w_amp: 0.5 }), b: wave.with({ w_amp: 2 }), /* … */ }, /* … */ });

// Um grafo de conjunto como nó: expandido no grafo que o usa (`uso_nó`); entradas abertas (`open`) por dentro.
const filter = Subgraph.set(stageGraph, { name: 'my.filter', inputs: { in: 'm.in' }, outputs: { out: 'f.out' } });
```

- **De ponto**: a função do nó é o grafo compilado (`sub_<hash>`), emitida uma vez por shader — usos repetidos
  compartilham o código e o pipeline; os parâmetros não expostos ficam embutidos; os estágios do nó são os comuns aos
  nós de dentro.
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

A biblioteca fica na C3, em `src/elements/nodes`, um subdiretório por categoria (`input/`, `math/`, `map/`, `noise/`,
`condition/`, `space/`, `field/`, `surface/`, `output/`, `set/`). É publicada por `nodes` (os nós por categoria) e
`defaultNodeRegistry` (todos os nós de ponto e de conjunto, para a serialização; `defaultNodeRegistry.names()` lista os
disponíveis). São **64 nós de ponto**, 12 de conjunto e as entradas de contexto.

Os nós de ponto valem em todos os estágios, salvo `output.surfaceParams` (só `fragment`). Cada um tem a referência da
CPU em `src/elements/nodes/reference` (f64; aritmética inteira u32 exata nos ruídos) e um caso de teste
(`reference/cases.ts`, 128 amostras determinísticas) avaliado pelo teste da biblioteca e, na GPU, pelo smoke
`nodeGraphs`. A **tolerância** é por componente: `|gpu − referência| ≤ tol · max(1, |referência|)`.

### Entradas de contexto (`nodes.input`)

Não são funções: são os argumentos da função do ponto alvo como nós (`graphArgument`), com a porta `value` (o argumento
inteiro) e uma por campo. Uma entrada que o ponto não tem não compila (`target`, nomeando o argumento e os do ponto).

| Entrada | Argumento | Ponto | Portas |
|---|---|---|---|
| `surfaceSample()` | `s` | `material` | `world_position`, `normal`, `uv`, `time`, `metric`, `curvature`, `principal` (geometria diferencial da 010) |
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

### Saída (`nodes.output`)

`output.surfaceParams` — a saída do ponto `material` (`SurfaceParams`), só em `fragment`: entradas `base_color`,
`alpha`, `roughness`, `metallic`, `emissive`; sem ligação, as constantes do material (`m.albedo.rgb`, `m.albedo.a`,
`m.roughness`, `m.metallic`, emissão 0), como a função pronta. Tolerância 1e-6.

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
- Materiais por nós (closures, camadas, OpenPBR como sub-grafo) são da 011; texturas procedurais em compute, da 012; a
  biblioteca de geometria (subdividir, curvas, L-systems), da 032; física por nós, da F5.
- Pendências abertas da 031 estão em `specs/PENDENCIAS.md`.
