---
sidebar_position: 14
title: Flows
---

# Flows — escrevendo um algoritmo novo (nível N3)

Um **Flow** é um estágio do quadro: um solver de física, a composição das transformações, a sombra, o render
principal, o pós-processamento, a UI. Os Flows do motor e os seus usam o mesmo contrato. Você **declara** o que o
algoritmo consome e como ele reage a eventos; a Camada 2 (C2) resolve os dados da cena, atribui as ligações dos
recursos que os shaders declaram, cria e mantém os bind groups e decide quando o Flow entra no quadro.

Um Flow declara:

| Campo | O que é |
|---|---|
| `type` | Nome do estágio (mensagens de erro, profiling, `flowReady`) — dado, não nome de classe. |
| `slots` | Os dados da cena que o algoritmo lê, tipados, pelos construtores `slot.*`. |
| `pipelines` | Os pipelines compilados antes de o Flow ficar pronto (`PipelineDescriptor`). |
| `bindings` | Fontes dos recursos **privados** (uniforms por passo, temporários): `Map<BindingKey, BindingSource>`, pela identidade do recurso declarado. |
| `listens` | Schemas cujos envios chegam ao Flow como evento: `poolWritten` (dado em pool, faixas de slots) ou `resourceReady` (Resource com objetos próprios). |
| `initialState` / `transitions` | A máquina de estados do algoritmo: `estado → evento → destino`. |
| `dispatch(frame, bound)` | A gravação do quadro. **Só grava**: nada é criado nem escrito aqui. |
| `dispose()` | Libera os recursos privados (chamado no `unregister` ou no descarte da cena). |

## Slots

Cada slot é resolvido pela C2 e entregue ao `dispatch` em `bound.slots`, com tipo:

| Construtor | Resolve para | Uso típico |
|---|---|---|
| `slot.bodies()` | `BoundPool` do `bodyType` do registro | o pool de corpos de um solver |
| `slot.pool(key, { optional? })` | `BoundPool` (buffer, `count`, `stride`, `slotOf`, `rangeOf`, `entityAt`, `live`) | `WorldTransform`, restrições |
| `slot.pools(keys)` | mapa chave → `BoundPool \| undefined` | conjunto de colliders |
| `slot.singleton(schema, { optional?, select? })` | `BoundSingleton` (`resource`, `bufferOf(descId)`…) | câmera, `Time`, `GravityField` |
| `slot.entities({ all: [A, B, …], record?, groups?, owns? })` | `BoundEntities` (entidades com um Resource de cada tipo; com `record`, `entry.recordSlot` e `records`; com `groups`, `groups` e `instances`) | renderizáveis, casters, corpos |
| `slot.texture(schema, descId, { optional?, select? })` | `BoundTexture` (`texture`, `view`) | cor da cena, mapa de sombra |
| `slot.target('canvas' \| { color, depth?, samples? })` | `BoundTarget` (só em `RenderFlow`; `samples`/`sampleCount` com MSAA) | alvo de render |

Com `record`, a C2 mantém um registro de GPU por entidade do conjunto, num pool com chave `record.schema.name`: cada
campo (`u32`) recebe o slot de pool do descritor nomeado de um Resource da entidade — ex.: `renderableRecord` =
`{ transformSlot: [Transform, 'world'], materialSlot: [Material, 'material'] }`. O estágio desenha com
`firstInstance = entry.recordSlot` e o shader lê o registro (`renderables[instance_index]`), sem bind group por
entidade. Conjuntos com a mesma declaração compartilham o pool; o estágio nunca escreve nele.

### Grupos de instâncias (`groups`)

Com `groups`, a C2 agrupa as entidades do conjunto por uma chave e mantém, num pool com chave `groups.schema.name`
(um struct com um único campo `u32`), uma **lista de instâncias** em que cada grupo ocupa um trecho contíguo. O
estágio desenha um grupo com uma chamada só — `draw.indexed(índices, group.count, 0, 0, group.first)` — e o shader
acha a entidade pela lista (`instances[instance_index]`):

```typescript
renderables: slot.entities({
  all: [Geometry, Material, Transform],
  record: renderableRecord,
  groups: {
    schema: RenderInstanceSchema,            // { renderable: u32 }
    key: (entry) => `${entry.get(Geometry).contentKey}|${entry.get(Transform).mirrored ? 'cw' : 'ccw'}`,
    instance: 'record',                      // valor da lista: o slot do registro (ou [Tipo, 'descId'])
    rekeyOn: { [Transform.schema.name]: ['scale'] }, // campos cujo envio reavalia a chave
  },
}),
```

`bound.slots.renderables.groups` é a lista de `DrawGroup` (`key`, `first`, `count`, `representative`), refeita só
quando a composição muda; `instances` é o pool da lista. A C2 mantém os grupos por eventos (inserção, remoção,
`rekeyOn`): com a cena parada nada é percorrido. Conjuntos com o mesmo schema de lista compartilham a lista.

### Posse da GPU (`owns`)

`owns: [[Transform, 'transform']]` passa à GPU a posse daquele descritor das entidades do conjunto: depois do
primeiro envio a CPU não escreve mais o slot (mutação ignorada com aviso único), o crescimento do pool preserva o
dado por cópia na GPU e o dado é lido sob demanda com `app.resources.read(resource)` / `readAll(resources)`. O
`BoundPool` informa `gpuOwned` (quantos slots são de posse da GPU) e `ownedByGpu(slot)`. É assim que a física
publica a pose dos corpos direto no `Transform`.

`owns` também aceita um descritor **individual** (spec 008): o conjunto passa a ser o escritor declarado de um dado
`upload: 'never'` — ex.: `owns: [[PointCloudGeometry, 'vertices']]` num estágio que escreve os vértices por kernel. A C2
registra o escritor (`resources.hasGpuWriter(geometria, 'vertices')`); o forward avisa uma vez quando desenha uma
geometria `'never'` sem escritor.

### Faixas e slots vivos (spec 008)

Um Resource com descritor `count: N` em pool ocupa N slots contíguos: `bound.slots.x.rangeOf(entityId)` dá
`{ first, count }` (os corpos de partículas usam isso; o desenho deles lê `first + instance_index`). Kernels que
percorrem `[0, count)` de um pool com faixas liberadas testam o bitset de vivos: `BoundPool.live` (no shader, um
recurso `array<u32>` com fornecedor `{ slot: 'bodies', part: 'live' }` ou `{ consumer: '<pool>.live' }`) e
`pool_live(live[i >> 5u], i)` do módulo `poolLive` da `wgslLib`.

Slot obrigatório não resolvido mantém o Flow `pending` (fora do quadro). Slots opcionais resolvem como `undefined`
enquanto o dado não existe; quando aparecem, somem ou trocam de recurso, o Flow recebe `slotChanged`.

## Bindings: recursos declarados (spec 031)

Os shaders não escrevem `@group/@binding`: cada recurso que um módulo usa é declarado com `wgslResource({ name,
binding, type, frequency, provider })` e posto em `requires`. A montagem (`composeWgsl`) atribui o grupo (pela
frequência: `frame` < `stage` < `batch` < `draw`) e a ligação (pela ordem do nome) e emite as linhas; o
`LayoutInferencer` lê essas declarações e deriva a visibilidade. Para cada binding que as entradas do pipeline usam, a
C2 resolve a fonte pelo **fornecedor declarado**:

1. `PipelineDescriptor.pools` — troca, só naquele pipeline, o pool que fornece um recurso;
2. `'private'` — a fonte que o Flow deu ao recurso: `{ pipeline, resource }` (só naquele pipeline — ex.: a mesma
   origem de pós com uma textura por efeito) vence o próprio recurso (todos os pipelines do Flow); sem fonte,
   `FlowBindingError` nomeando o recurso, o grupo, o pipeline e o Flow;
3. `{ scene: ponto }` — o global de um ponto de cena (o pool, ou um substituto zerado);
4. `{ slot: nome, part?, descriptor? }` — o que o slot do Flow resolveu (o pool, o bitset `live`, os registros ou as
   instâncias de um conjunto de entidades, uma textura, o descritor de um singleton);
5. `{ pool: chave }` / `{ consumer: nome }` — o `ConsumerResolver` registrado com esse nome.

Fonte ainda inexistente na cena faz o pipeline esperar. Cada pool criado registra o seu `PoolResolver`
automaticamente; fornecedores da C3/C4 (`Time`, `GravityField`, `ParticlePhysics`, `ShadowCaster.*`,
`WaterSurface.*`) já têm resolver, e `Application.create({ consumers })` registra os seus (`SingletonResolver`,
`PoolResolver`, `TextureResolver` ou uma implementação própria de `ConsumerResolver`). Uma fonte privada para um
recurso que tem fornecedor é erro. No `dispatch`, grave os grupos sem índices: `prepared.bindTo(pass.bind, {
frequência: offsets })`, ou `prepared.groupsOf(frequência)` para regravar só o que mudou. Detalhes em
[Arquitetura — Contrato de shader estruturado](./architecture_resource_loaders.md).

## Séries temporais: o canal temporal (spec 037)

Todo "valor do quadro anterior" — o histórico do antisserrilhado, o acúmulo da luz global, a névoa, o filtro temporal,
a energia de um corpo — é a mesma coisa: uma **série** de um recurso no tempo. A C2 mantém a série; o Flow só grava a
fatia de agora e lê os atrasos de que precisa. Nada de pipeline por paridade, metade de buffer por paridade ou cópia
por quadro.

**Declarar.** Um descritor de textura (`texture`, `storage-texture`), de buffer de storage ou de pool ganha `history`:

```ts
{
    id: 'history',
    role: 'texture',
    allocation: 'onDemand',
    textureShape: { format: 'rgba16float', sizeFromCanvas: true },
    // 2 fatias (a de agora e a anterior); 32 bits com 'full' — sem `float32-filterable` e lida filtrada, a C2 fica em
    // 16 bits com um aviso.
    history: { depth: 2, precision: 'full', filtered: true },
}
```

A C2 aloca `depth` fatias (texturas do mesmo `textureShape`, buffers do mesmo tamanho, ou buffers do pool crescendo
com ele — pool só com `upload: 'never'`). O canal existe desde a inserção do recurso; as fatias de um descritor
`onDemand`, desde o `ensureAllocated` / `ensurePoolAllocated` de quem usa.

**O anel.** No começo de cada quadro (`frameRecording`), todo canal cuja fatia de agora foi gravada no quadro anterior
gira: a gravada vira o atraso 1, a mais antiga é reaproveitada como a de agora. Canal não gravado não gira — o atraso 1
continua sendo a última gravação, e o carimbo (`stamp(lag)`: o quadro e o tempo) e a idade (`age(lag)`: quadros desde
a gravação) dizem quanto tempo passou. `frames` conta as gravações seguidas desde a última invalidação; o atraso `k`
vale com `frames ≥ k`. A série recomeça (`frames = 0`) quando as fatias são recriadas (redimensionamento, `redescribe`,
crescimento do pool), quando entra ou sai entidade do pool da série, ou quando o produtor pede (`invalidate()`). O
corte de câmera continua na GPU (`CameraMatrices.history.x`, `temporal_cut`): é por câmera, não por recurso.

**Ligar.** O slot `slot.channel(Schema, 'descId')` (ou `slot.poolChannel('Pool')`) dá o `BoundChannel` (vivo: `depth`,
`head`, `frames`, `format`, `view(lag)`, `buffer(lag)`, `stamp(lag)`, `age(lag)`, `written()`, `invalidate()`). Os
recursos de shader de cada fatia declaram o atraso no fornecedor:

```ts
const previous = wgslResource({
    name: 'taa_history',
    binding: { texture: { sample: 'f32' } },
    frequency: 'draw',
    provider: { slot: 'taaHistory', lag: 1 },
});
```

A C2 cria um bind group por **fase** do anel (cada combinação das cabeças dos canais do grupo, até 64), todos fora da
gravação, e escolhe o do quadro em `bindTo` / `groupsOf`. Alvos de render usam `view(0)`. O `dispatch` que gravou a
fatia de agora chama `written()` — não o `framePrepare`: um quadro pulado pela prontidão não gira o anel.

**Quem já usa.** O antisserrilhado (`TemporalAntialiasing.history|state|light`), a luz global de tela
(`GlobalIllumination.screenHistory`, um buffer), a névoa (`Froxels.history`, 3D, lida filtrada), o filtro temporal
(`TemporalFilter.accumulated|accumulatedMoments|guide`) e a energia dos corpos rígidos e moles (`RigidBody.energy`: o pool
`BodyEnergy`; `SoftBody.energy`: o pool `SoftBodyEnergy`, um registro por corpo; 8 fatias, com o `EnergyMeter` na
cena — ver [Física](./physics_flows.md)). Contrato:
`specs/037-padronizacao-matematica/contracts/temporal-channel.md`.

## Transições e eventos

O Flow tem dois estados, ambos mudados por eventos:

- **Ciclo de vida** (`flow.lifecycle`), só da C2: `pending → preparing → ready → disposed`. Em `ready` a C2 emite
  `flowReady` e o `ExecutionSystem` passa a gravar o Flow; perder um slot obrigatório volta a `pending`
  (`flowSuspended`).
- **Estado do algoritmo** (`flow.state`), só por transições. A tabela tem uma entrada por estado (e `'*'` para
  qualquer estado); cada entrada é `'ignore'` ou `{ to, run? }`. **Evento sem entrada lança `FlowTransitionError`.**

No `run(event, ctx)` o Flow recria e religa recursos privados (`ctx.bind(new Map([[recurso, fonte]]))`), prepara pipelines que
dependem da cena (`ctx.prepare(descriptor)`, idempotente por `id`) e os libera (`ctx.release(id)`). A C2 recria os
bind groups afetados antes da próxima gravação.

Um Flow que escreve um dado só em alguns quadros declara em `framePrepare` se o produziu:
`ctx.produced(resource, descId, produced)` (spec 031). Quem lê consulta `resources.isProduced(resource, descId)`
(`ResourceDirectory`) e só grava com o dado produzido. Um descritor tem um produtor só (o primeiro Flow que o marca); um
segundo produtor é erro. É assim que a água liga produtor (`FluidSurfaceFlow`) e consumidores (`WaterFlow`,
`CausticsFlow`) pelos descritores `WaterSurface.producedDescriptor`.

| Evento | Quando a C2 entrega |
|---|---|
| `slotsResolved` | slots obrigatórios resolvidos (entrada em `preparing`) |
| `slotLost` | um slot obrigatório deixou de existir (volta a `pending`) |
| `slotChanged` | um slot opcional (ou um slot `pools`) apareceu, sumiu ou trocou de recurso |
| `pipelinesCompiled` | os pipelines declarados compilaram (entrada em `ready`); com `pipeline`, um preparado em transição |
| `bindGroupReplaced` | uma fonte foi recriada e o bind group trocado — o `dispatch` lê o novo em `bound.pipelines` |
| `entitiesChanged` | entidades entraram ou saíram de um slot `entities` — agregado: um evento por slot por quadro (`added`, `removed`), entregue antes de `framePrepare` |
| `canvasReconfigured` | o canvas mudou de tamanho (só Flows com `target`) |
| `poolReallocated` | um pool dos slots cresceu |
| `poolWritten` | a C2 enviou faixas de um pool de schema de `listens` (`poolKey`, `ranges`, `fields?`) — um por pool por envio |
| `resourceReady` | um Resource de `listens` com objetos próprios (não em pool) foi alocado ou enviado |
| `framePrepare` | **opt-in**: antes da gravação de cada quadro — escrever parâmetros, crescer buffers |
| `frameRecorded` | **opt-in**: depois do envio do quadro — iniciar leituras |

`framePrepare` e `frameRecorded` só chegam a quem os declara. Eventos de domínio só chegam em `preparing`/`ready`.

## Exemplo completo — um integrador simples

Um Resource de partícula em pool e um Flow que avança `posição += velocidade × dt` uma vez por passo de física.

```typescript
import {
  Flow, slot, Time, StructSchema, FieldType, ResourceState, Entity, wgslModule, wgslResource, WORKGROUP_SIZE,
  type BindingSources, type BoundFlow, type FlowContext, type FlowTransitions, type Frame,
  type GPUDescriptor, type PipelineDescriptor, type Resource, type TransitionContext, type UniformBufferSpec,
} from 'clayflow';

// 1. O dado: um pool de storage (uma partícula por entidade).
export const DrifterSchema = new StructSchema('Drifter', {
  position: FieldType.vec4f,
  velocity: FieldType.vec4f,
});

// `data` é o acessor de `Entity`, tipado pelo parâmetro: a subclasse atribui no construtor e não declara o campo.
export class Drifter extends Entity<{ position: number[]; velocity: number[] }> implements Resource {
  static readonly schema = DrifterSchema;
  state: ResourceState = ResourceState.Uninitialized;
  constructor(values: { position?: number[]; velocity?: number[] } = {}) {
    super();
    this.data = DrifterSchema.applyDefaults(values);
  }
  getDescriptors(): readonly GPUDescriptor[] {
    return [{ id: 'body', role: 'storage-rw', schema: DrifterSchema, storage: 'pool', upload: 'initial' }];
  }
  getPipelineDescriptors(): readonly PipelineDescriptor[] {
    return [];
  }
}

// 2. O shader: recursos declarados e structs gerados dos schemas; nenhuma ligação nem offset à mão.
const DriftParamsSchema = new StructSchema(
  'DriftParams',
  { dt: FieldType.f32, count: FieldType.u32 },
  { addressSpace: 'uniform' },
);

const driftBodies = wgslResource({
  name: 'bodies',
  binding: { storage: 'read_write' },
  type: { schema: DrifterSchema, array: true },
  frequency: 'stage',
  provider: { slot: 'bodies' },          // o pool que o slot `bodies` resolveu
});
const driftParams = wgslResource({
  name: 'params',
  binding: { uniform: true },
  type: { schema: DriftParamsSchema },
  frequency: 'stage',
  provider: 'private',                   // o Flow liga pelo objeto do recurso
});

const drift = wgslModule({
  name: 'drift',
  requires: [WORKGROUP_SIZE.module, driftBodies, driftParams],
  source: `
@compute @workgroup_size(WORKGROUP_SIZE) fn drift_main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= params.count) { return; }
    bodies[id.x].position += bodies[id.x].velocity * params.dt;
}`,
});

// 3. O Flow.
const slots = {
  bodies: slot.bodies(),                 // o pool do bodyType do registro ('Drifter')
  time: slot.singleton(Time.schema),     // passos de física do quadro
};
type DriftSlots = typeof slots;
type Ctx = TransitionContext<DriftSlots>;

export class DriftFlow extends Flow<DriftSlots, 'running'> {
  readonly type = 'DriftFlow';
  readonly slots = slots;
  override readonly pipelines: readonly PipelineDescriptor[] = [
    // `bodies` vem do slot (fornecedor { slot: 'bodies' }); `params` é privado.
    { id: 'drift', role: 'compute', shader: drift, entryPoints: ['drift_main'] },
  ];
  override readonly bindings: BindingSources;
  protected readonly initialState = 'running' as const;
  protected readonly transitions: FlowTransitions<'running', Ctx> = {
    '*': {
      slotsResolved: 'ignore',
      slotLost: 'ignore',
      pipelinesCompiled: 'ignore',
      bindGroupReplaced: 'ignore',   // a C2 já trocou o grupo; o dispatch lê o novo
      poolReallocated: 'ignore',
      framePrepare: { to: 'running', run: (_e, c) => this.writeParams(c) },
    },
  };

  private readonly ctx: FlowContext;
  private readonly params: UniformBufferSpec;

  constructor(ctx: FlowContext) {
    super();
    this.ctx = ctx;
    this.params = ctx.core.create<UniformBufferSpec>({
      kind: 'buffer', subkind: 'uniform', discriminator: 'drift_params', byteSize: DriftParamsSchema.stride,
    });
    this.bindings = new Map([[driftParams, this.params]]);
  }

  /** Antes da gravação: dt e contagem do quadro. */
  private writeParams(ctx: Ctx): void {
    const time = ctx.bound.slots.time.resource as Time;
    this.ctx.core.write(
      this.params,
      DriftParamsSchema.pack({ dt: time.stepDt * time.steps, count: ctx.bound.slots.bodies.count }),
    );
  }

  /** Só grava. */
  dispatch(frame: Frame, bound: BoundFlow<DriftSlots>): void {
    const count = bound.slots.bodies.count;
    if (count === 0) return;
    const p = bound.compute('drift');
    frame.compute('DriftFlow', (pass) => {
      pass.bind.setPipeline(p.spec);
      p.bindTo(pass.bind);                 // grupos pela frequência, sem índices escritos
      pass.dispatch.invocations(count, WORKGROUP_SIZE.value);
    });
  }

  override dispose(): void {
    this.ctx.core.destroy(this.params);
  }
}

// 4. O registro: instanciado quando o primeiro Drifter cria o pool.
app.flows.register((ctx) => new DriftFlow(ctx), { type: 'DriftFlow', phase: 'physics', bodyType: 'Drifter' });
app.world.insert(new Drifter({ velocity: [1, 0, 0, 0] }));
```

Os grupos e a visibilidade vêm do WGSL; o `@binding(0)` recebe o buffer do pool e o `@binding(1)` o uniform
privado. Se o pool crescer, a C2 recria o grupo 0 (`bindGroupReplaced`) e o próximo `dispatch` já o usa.

## Registro

```typescript
const reg = app.flows.register(factory, { type, phase, bodyType?, priority? }); // → FlowRegistration (reg.flow)
app.flows.override(bodyType, factory, { type, phase, priority? });               // vence a prioridade
app.flows.unregister(reg);                                                       // descarta a instância
```

- **Sem `bodyType`** a factory é chamada no registro; **com `bodyType`**, quando o pool do tipo passa a existir
  (`poolCreated`) e o registro vence a seleção (override → maior `priority` → último registrado).
- **Ordem do quadro**: fases fixas `physics → transform → shadow → forward → post → ui`; dentro da fase, `priority`
  decrescente, empate pela ordem de registro.
- A factory recebe `FlowContext { core, world, resources, events, bodyType? }`.
- `FlowRegistrationError`: `type` repetido na fase, `bodyType` vazio, registro fora de uma cena.

### Ordem dos estágios padrão (com a iluminação global, spec 033)

Um quadro com céu, GI, névoa e água por campo passa por estes estágios. Cada um fica pendente (sem custo) sem o
Resource de que precisa.

| Fase | Estágio (prioridade) | O que faz |
|---|---|---|
| `physics` | solvers, `EmitterFlow` (−100) | move as partículas e os corpos |
| `transform` | `TransformFlow`, `PbrTablesFlow` (10), `CameraFlow` (−10), `ShadowMatrixFlow` (−20) | matrizes de mundo, câmeras, matrizes de sombra |
| `transform` | `SoftSurfaceFlow` (−30), `SurfaceFlow` (−40), `GraphFlow` (−50) | geometria escrita na GPU |
| `transform` | `FluidFieldFlow` (−50) | o campo de distância dos fluidos |
| `transform` | `SkyFlow` (−55) | as tabelas da atmosfera, quando o sol anda |
| `transform` | `RaySceneFlow` (−60) | a estrutura de raios, depois de toda a geometria do quadro |
| `shadow` | `ShadowFlow` (0) | mapas de sombra |
| `shadow` | `ProbeFlow` (−5) | sondas de tela e do mundo, fótons |
| `shadow` | `FluidFieldPassFlow` luz (−10), `CausticsFlow` (−20) | a água vista da luz, as cáusticas dela |
| `shadow` | `FroxelFlow` (−30) | a névoa: injeção, acúmulo, integração (lê sombra e sondas) |
| `forward` | `ForwardFlow` (0) | passe de profundidade, opacos, céu ao fundo, transmissivos |
| `forward` | `ParticleFlow` (−50), `FluidFieldPassFlow` câmera (−60), `WaterFlow` (−70) | sprites, a água marchada e a composição dela |
| `post`, `ui` | `PostFlow`, `UIFlow` | pós-processamento, interface |

Os estágios conversam por Resources e pontos de cena, não por chamadas: a GI entra no desenho pelo `scene_lighting`, a
névoa pelo `scene_fog`, o céu pelo `scene_background`
([Shaders — pontos de cena](./shaders.md#pontos-de-cena-spec-033)).

## Flows de render

`RenderFlow` é um `Flow` cujo slot `target` é o alvo de render: o canvas (`slot.target('canvas')`) ou texturas de
Resources (`{ color, depth }` — ex.: a cor e a profundidade dos `FrameTargets`, a `depth` de um `ShadowMap`; `color:
'none'` para passes só de profundidade). A C2 resolve o alvo, inclusive o formato (`bound.slots.target.format`), e o
recria com o canvas. No `dispatch`, `this.colorView(frame, bound.slots.target)` dá a view de cor do quadro; com MSAA
(`slot.target({ …, samples: { schema: FrameTargets.schema, descId: 'samples' } })`),
`this.colorAttachment(frame, target, { loadOp })` monta o anexo que desenha nas amostras e resolve na cor, e os
pipelines usam `multisample: { count: bound.slots.target.sampleCount }`.

```typescript
class OverlayFlow extends RenderFlow<{ target: TargetSlot }, 'idle'> {
  readonly type = 'OverlayFlow';
  readonly slots = { target: slot.target('canvas') };
  // pipelines com colorTargets: [{ format: ctx.core.canvasFormat, blend: … }], privados, transições…
  dispatch(frame: Frame, bound: BoundFlow<{ target: TargetSlot }>): void {
    const view = this.colorView(frame, bound.slots.target);
    const p = bound.pipelines.get('overlay');
    if (view === undefined || p?.role !== 'render' || !p.ready) return;
    frame.render({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] }, 'OverlayFlow', (pass) => {
      pass.bind.setPipeline(p.spec).setBindGroup(0, p.groups[0]!);
      pass.draw.vertices(3);
    });
  }
}
app.flows.register((ctx) => new OverlayFlow(ctx), { type: 'overlay', phase: 'ui' });
```

## Regras que o gate verifica

- Nenhum estágio cria layout nem bind group: são da C2.
- Nenhum `dispatch` cria objeto de GPU (contado com todos os Flows padrão ativos).
- Toda tabela declara os eventos que a C2 pode entregar ao Flow, e os demais lançam `FlowTransitionError`.
- C3/C4 importam os tipos de GPU por `scene/contracts/gpu` (ou pelo barrel `clayflow`), nunca de `core/`.

Para o desenho completo (pools canônicos, resolvers, ciclo de vida dos Resources) veja
[Arquitetura](./architecture_resource_loaders.md).
