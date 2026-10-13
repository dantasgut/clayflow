# Quickstart: Slots de Flow

## Escrever um Flow (N3)

```ts
import { Flow, slot, wgslModule, type BoundFlow, type Frame } from 'clayflow';
import heatSource from './heat.wgsl?raw';

const heat = wgslModule({
  name: 'heat',
  source: heatSource,
  structs: [HeatCell.schema, HeatParams],
});

class HeatFlow extends Flow<
  { cells: ReturnType<typeof slot.bodies>; time: ReturnType<typeof slot.singleton> },
  'idle'
> {
  readonly type = 'HeatFlow';
  readonly slots = { cells: slot.bodies(), time: slot.singleton(Time.schema) };
  readonly pipelines = [
    {
      id: 'diffuse',
      role: 'compute',
      shader: heat,
      entryPoints: ['diffuse_main'],
      consumes: ['HeatCell', 'Time'],
    },
  ] as const;
  protected readonly transitions = { idle: { poolReallocated: 'ignore' } } as const;

  dispatch(frame: Frame, bound: BoundFlow<this['slots']>): void {
    const p = bound.pipelines.get('diffuse')!;
    frame.compute('HeatFlow', (pass) => {
      pass.bind.setPipeline(p.spec);
      p.groups.forEach((g, i) => pass.bind.setBindGroup(i, g));
      pass.dispatch.invocations(bound.slots.cells.count, 64);
    });
  }
}

app.flows.register(() => new HeatFlow(), {
  type: 'HeatFlow',
  phase: 'physics',
  bodyType: 'HeatCell',
});
```

O WGSL declara `@group(0) @binding(0) var<storage, read_write> cells: array<HeatCell>;` e
`@group(0) @binding(1) var<uniform> time: Time;` — grupos, bindings e visibilidade são inferidos; o Flow nunca cria
layout nem bind group.

## Consumir um Resource próprio

```ts
await Application.create({
  canvas,
  consumers: (r) => r.register(new SingletonResolver(Wind.schema, 'wind')),
});
```

## Validar

```bash
npm run test:coverage            # registro, transições, inferência, resolvers, pools uniformes, contagens por entidade
npm run lint                     # inclui a fronteira C3/C4 → scene/ (D4)
npm run smoke -- trajectories,render,churn,limits,rigidContacts,integration,transforms,time,multiApp,bigMesh,stress60s,shaderLibrary,computeKernels          # os 13 smokes (trajetórias a 30/60/144 Hz, imagem…)
npm run smoke -- trajectories,render,churn,limits,rigidContacts,integration,transforms,time,multiApp,bigMesh,stress60s,shaderLibrary,computeKernels --dist   # idem sobre o build minificado
npm run bench:check              # instances/10k: CPU por quadro −30% contra o baseline
```

## Migração (0.x, incompatível)

| Antes                                                                                             | Depois                                                                           |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `flows.register(new XFlow(core, world, resources))`                                               | `flows.register((ctx) => new XFlow(ctx), { type, phase, bodyType?, priority? })` |
| `flow.phase` / `flow.priority` / `flow.bodyType`                                                  | `RegisterOptions`                                                                |
| `isReady()`, `onPoolReallocated`, `onCanvasResized`, `onEntitiesInserted/Removed`, `onEvent`      | slots + `transitions`                                                            |
| `getPipelineDescriptors()`                                                                        | `pipelines`                                                                      |
| `forward.bindShadowFlow(shadow)`, `post.bindForwardFlow(forward)`, `forward.setRenderToOffscreen` | slots em `ShadowMap` e `FrameTargets`                                            |
| `new ShadowFlow(..., { mapSize })`                                                                | `ShadowMap.data.size` (anexado à `DirectionalLight`)                             |
| `DEFAULT_FLOW_FACTORIES` / `autoRegisterFlows`                                                    | factories registradas pela cena; seleção pela C2                                 |
| `createComputeKernel({ bindings: [{ binding, type, buffer }] })`                                  | `bindings: { nomeDaVariavel: buffer }` (layout inferido)                         |
| `import type { EngineCore } from '…/core/contracts'` em C3/C4                                     | `from '…/scene'`                                                                 |
