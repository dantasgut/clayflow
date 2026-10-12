# Quickstart: Núcleo de shaders

## Escrever um módulo e um kernel (estágio do motor, C3)

Estágios do motor importam pelos contratos de `scene/` (Princípio I); `wgslLib` vem de `elements/gpu/shaders`.

```ts
import { wgslModule } from '../../scene/shaders';
import { StructSchema, FieldType } from '../../scene/descriptors';
import { createComputeKernel } from '../../scene/flows';
import { wgslLib } from '../gpu/shaders';
import { Transform } from '../scene/Transform';

const OrbitParams = new StructSchema(
  'OrbitParams',
  { center: FieldType.vec4f, omega: FieldType.f32, count: FieldType.u32 },
  { addressSpace: 'uniform' },
);

const orbitKernel = wgslModule({
  name: 'orbit_kernel',
  requires: [wgslLib.quat, wgslLib.mat],
  structs: [OrbitParams, Transform.schema],
  source: /* wgsl */ `
    {{struct:OrbitParams}}
    @group(0) @binding(0) var<uniform> params: OrbitParams;
    @group(0) @binding(1) var<storage, read_write> transforms: array<Transform>;
    @compute @workgroup_size(64)
    fn orbit_main(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) n: vec3u) { … }
  `,
});

const kernel = createComputeKernel(core, {
  discriminator: 'orbit',
  shader: orbitKernel,
  entryPoint: 'orbit_main',
  bindings: [ … ],
});
```

- `quat` e `mat` (e o `linalg` que `mat` requer) entram uma vez; `OrbitParams` e `Transform` são gerados dos schemas.
- Esquecer `quat` em `requires` dá erro na criação nomeando a função não definida; definir uma função que `mat` já
  define dá `symbol-conflict` nomeando os dois módulos.

## Gravar parâmetros por passo

```ts
const params = new PerStepUniforms(core, { discriminator: 'orbit_params', schema: OrbitParams });
params.reserve(steps);
for (let i = 0; i < steps; i++) params.write(i, { center: [0, 0, 0, 1], omega: 2, count });
params.flush(steps);
```

## Usar um kernel genérico

```ts
const sort = new RadixSort(core, { discriminator: 'cells', capacity: 1 << 20, withValues: true });
sort.record(frame, { keys: cellIds, values: particleIds, count: n });
```

## Validar

```bash
npm run lint && npm run format:check && npm run check:circular && npm run check:dead && npx tsc --noEmit \
  && npm run typecheck:bench && npm run test:coverage && npm run doc:coverage && npm run build:lib
npm run smoke -- trajectories,shaderLibrary,computeKernels,render,limits,rigidContacts
npm run smoke -- time,transforms,integration,multiApp,limits,churn,bigMesh,rigidContacts,stress60s,trajectories,shaderLibrary,computeKernels,render --dist
npm run bench:check
```

- `trajectories`: compara com a fixture gravada antes da 005 (bit a bit; tolerância registrada para SPH/PBF).
- `render`: compara pixels das cenas do bench com a captura de antes (FR-041).
- Gate de CPU inclui `wgslInventory` (nenhum `.wgsl` órfão) e `wgslSymbols` (nenhuma função duplicada).

## Migração (0.x, incompatível)

| Antes                                                       | Depois                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `createComputeKernel({ shaderSource })`                     | `createComputeKernel({ shader: wgslModule(…) })`             |
| `PipelineDescriptor.shaderSource`                           | `PipelineDescriptor.shader`                                  |
| `PostProcessEffect.fragmentSource()` com concatenação       | módulo com `requires: [effectsBase]`                         |
| `new PerStepUniforms(core, { byteSize })` + `f32(i)[k] = …` | `{ schema }` + `write(i, data)`                              |
| `FieldType.u16` / `i16`                                     | removidos                                                    |
| `GraphColorSolver.color(edges)` (CPU)                       | `new GraphColorer(core, …).color(edges, count, vertexCount)` |
| `scene.add(e)` só anexava                                   | insere no World (e anexa); `addEntity` devolve o `EntityId`  |
| `flows.resolve(bodyType)` = último registrado               | maior `priority` (empate: último registrado)                 |
