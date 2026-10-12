---
sidebar_position: 14
title: Flows
---

# Flows — escrevendo um algoritmo novo (nível N3)

Um **Flow** é um estágio do quadro: um solver de física, a composição das transformações, a sombra, o render
principal, o pós-processamento, a UI. Os Flows do motor e os seus usam o mesmo contrato. Você **declara** o que o
algoritmo consome e como ele reage a eventos; a Camada 2 (C2) resolve os dados da cena, infere os layouts do WGSL,
cria e mantém os bind groups e decide quando o Flow entra no quadro.

Um Flow declara:

| Campo | O que é |
|---|---|
| `type` | Nome do estágio (mensagens de erro, profiling, `flowReady`) — dado, não nome de classe. |
| `slots` | Os dados da cena que o algoritmo lê, tipados, pelos construtores `slot.*`. |
| `pipelines` | Os pipelines compilados antes de o Flow ficar pronto (`PipelineDescriptor`). |
| `bindings` | Recursos **privados** pelo nome da variável no WGSL (uniforms por passo, temporários). |
| `listens` | Schemas cujos `resourceReady` chegam ao Flow como evento. |
| `initialState` / `transitions` | A máquina de estados do algoritmo: `estado → evento → destino`. |
| `dispatch(frame, bound)` | A gravação do quadro. **Só grava**: nada é criado nem escrito aqui. |
| `dispose()` | Libera os recursos privados (chamado no `unregister` ou no descarte da cena). |

## Slots

Cada slot é resolvido pela C2 e entregue ao `dispatch` em `bound.slots`, com tipo:

| Construtor | Resolve para | Uso típico |
|---|---|---|
| `slot.bodies()` | `BoundPool` do `bodyType` do registro | o pool de corpos de um solver |
| `slot.pool(key, { optional? })` | `BoundPool` (buffer, `count`, `stride`, `slotOf`, `entityAt`) | `WorldTransform`, restrições |
| `slot.pools(keys)` | mapa chave → `BoundPool \| undefined` | conjunto de colliders |
| `slot.singleton(schema, { optional?, select? })` | `BoundSingleton` (`resource`, `bufferOf(descId)`…) | câmera, `Time`, `GravityField` |
| `slot.entities({ all: [A, B, …], record? })` | `BoundEntities` (entidades com um Resource de cada tipo; com `record`, `entry.recordSlot` e `records`) | renderizáveis |
| `slot.texture(schema, descId, { optional?, select? })` | `BoundTexture` (`texture`, `view`) | cor da cena, mapa de sombra |
| `slot.target('canvas' \| { color, depth? })` | `BoundTarget` (só em `RenderFlow`) | alvo de render |

Com `record`, a C2 mantém um registro de GPU por entidade do conjunto, num pool com chave `record.schema.name`: cada
campo (`u32`) recebe o slot de pool do descritor nomeado de um Resource da entidade — ex.: `renderableRecord` =
`{ transformSlot: [Transform, 'world'], materialSlot: [Material, 'material'] }`. O estágio desenha com
`firstInstance = entry.recordSlot` e o shader lê o registro (`renderables[instance_index]`), sem bind group por
entidade. Conjuntos com a mesma declaração compartilham o pool; o estágio nunca escreve nele.

Slot obrigatório não resolvido mantém o Flow `pending` (fora do quadro). Slots opcionais resolvem como `undefined`
enquanto o dado não existe; quando aparecem, somem ou trocam de recurso, o Flow recebe `slotChanged`.

## Bindings: privados e `consumes`

Os layouts vêm do WGSL montado (`LayoutInferencer.infer`): grupos, bindings, tipo e visibilidade. Para cada binding
que as entradas do pipeline usam, a C2 procura a fonte nesta ordem:

1. privado `pipeline:variável` (vale só para aquele pipeline — ex.: a mesma `src_tex` com uma textura por efeito);
2. privado `variável` (vale para todos os pipelines do Flow);
3. um nome de `consumes` cujo tipo é o tipo do binding (o struct, ou o elemento de `array<…>`), ou o `as` da
   entrada `{ name, as }` — o `ConsumerResolver` registrado com esse nome devolve a fonte;
4. senão, `FlowBindingError` (nomeia binding, grupo, pipeline, Flow e o nome envolvido).

Fonte ainda inexistente na cena faz o pipeline esperar. Cada pool criado registra o seu `PoolResolver`
automaticamente; recursos únicos da C3 (Camera, GravityField, ParticleMaterial) já têm resolver, e
`Application.create({ consumers })` registra os seus (`SingletonResolver`, `PoolResolver`, `TextureResolver` ou uma
implementação própria de `ConsumerResolver`).

## Transições e eventos

O Flow tem dois estados, ambos mudados por eventos:

- **Ciclo de vida** (`flow.lifecycle`), só da C2: `pending → preparing → ready → disposed`. Em `ready` a C2 emite
  `flowReady` e o `ExecutionSystem` passa a gravar o Flow; perder um slot obrigatório volta a `pending`
  (`flowSuspended`).
- **Estado do algoritmo** (`flow.state`), só por transições. A tabela tem uma entrada por estado (e `'*'` para
  qualquer estado); cada entrada é `'ignore'` ou `{ to, run? }`. **Evento sem entrada lança `FlowTransitionError`.**

No `run(event, ctx)` o Flow recria e religa recursos privados (`ctx.bind({ nome: fonte })`), prepara pipelines que
dependem da cena (`ctx.prepare(descriptor)`, idempotente por `id`) e os libera (`ctx.release(id)`). A C2 recria os
bind groups afetados antes da próxima gravação.

| Evento | Quando a C2 entrega |
|---|---|
| `slotsResolved` | slots obrigatórios resolvidos (entrada em `preparing`) |
| `slotLost` | um slot obrigatório deixou de existir (volta a `pending`) |
| `slotChanged` | um slot opcional (ou um slot `pools`) apareceu, sumiu ou trocou de recurso |
| `pipelinesCompiled` | os pipelines declarados compilaram (entrada em `ready`); com `pipeline`, um preparado em transição |
| `bindGroupReplaced` | uma fonte foi recriada e o bind group trocado — o `dispatch` lê o novo em `bound.pipelines` |
| `entitiesChanged` | entidades entraram ou saíram de um slot `entities` |
| `canvasReconfigured` | o canvas mudou de tamanho (só Flows com `target`) |
| `poolReallocated` | um pool dos slots cresceu |
| `resourceReady` | um Resource de um schema de `listens` foi alocado ou enviado |
| `framePrepare` | **opt-in**: antes da gravação de cada quadro — escrever parâmetros, crescer buffers |
| `frameRecorded` | **opt-in**: depois do envio do quadro — iniciar leituras |

`framePrepare` e `frameRecorded` só chegam a quem os declara. Eventos de domínio só chegam em `preparing`/`ready`.

## Exemplo completo — um integrador simples

Um Resource de partícula em pool e um Flow que avança `posição += velocidade × dt` uma vez por passo de física.

```typescript
import {
  Flow, slot, Time, StructSchema, FieldType, ResourceState, Entity, wgslModule,
  type BindingSources, type BoundFlow, type FlowContext, type FlowTransitions, type Frame,
  type GPUDescriptor, type PipelineDescriptor, type Resource, type TransitionContext, type UniformBufferSpec,
} from 'clayflow';

// 1. O dado: um pool de storage (uma partícula por entidade).
export const DrifterSchema = new StructSchema('Drifter', {
  position: FieldType.vec4f,
  velocity: FieldType.vec4f,
});

export class Drifter extends Entity implements Resource {
  static readonly schema = DrifterSchema;
  state: ResourceState = ResourceState.Uninitialized;
  data: Record<string, unknown>;
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

// 2. O shader: structs gerados dos schemas; nenhum offset à mão.
const DriftParamsSchema = new StructSchema(
  'DriftParams',
  { dt: FieldType.f32, count: FieldType.u32 },
  { addressSpace: 'uniform' },
);

const drift = wgslModule({
  name: 'drift',
  structs: [DrifterSchema, DriftParamsSchema],
  source: `
@group(0) @binding(0) var<storage, read_write> bodies: array<Drifter>;
@group(0) @binding(1) var<uniform> params: DriftParams;
@compute @workgroup_size(64) fn drift_main(@builtin(global_invocation_id) id: vec3u) {
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
    // `bodies` vem de consumes (tipo Drifter → PoolResolver do pool 'Drifter'); `params` é privado.
    { id: 'drift', role: 'compute', shader: drift, entryPoints: ['drift_main'], consumes: ['Drifter'] },
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
    this.bindings = { params: this.params };
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
      pass.bind.setPipeline(p.spec).setBindGroup(0, p.groups[0]!);
      pass.dispatch.invocations(count, 64);
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

## Flows de render

`RenderFlow` é um `Flow` cujo slot `target` é o alvo de render: o canvas (`slot.target('canvas')`) ou texturas de
Resources (`{ color, depth }` — ex.: a cor e a profundidade dos `FrameTargets`, a `depth` de um `ShadowMap`; `color:
'none'` para passes só de profundidade). A C2 resolve o alvo, inclusive o formato (`bound.slots.target.format`), e o
recria com o canvas. No `dispatch`, `this.colorView(frame, bound.slots.target)` dá a view de cor do quadro.

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
