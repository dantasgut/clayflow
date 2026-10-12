# Contrato — Módulos WGSL e montagem

## `wgslModule` / `WgslModule` (C2, `scene/shaders/WgslModule.ts`; exportado por `scene`)

```ts
interface WgslModule {
  readonly name: string;
  readonly source: string;
  readonly requires: readonly WgslModule[];
  readonly structs: readonly StructSchema[];
  readonly symbols: readonly WgslSymbol[]; // derivado do fonte na criação
}

interface WgslSymbol {
  readonly name: string;
  readonly kind: 'fn' | 'struct' | 'const' | 'override' | 'alias' | 'var';
}

function wgslModule(options: {
  name: string;
  source: string;
  requires?: readonly WgslModule[];
  structs?: readonly StructSchema[];
}): WgslModule; // congelado
```

- `name` vazio → `TypeError`. O fonte é varrido uma vez: comentários (`//`, `/* */` aninhados) ignorados; símbolos de
  nível superior extraídos (atributos como `@compute @workgroup_size(64)` e `@group(0) @binding(1)` são aceitos antes
  da declaração).
- Um módulo que define o mesmo símbolo duas vezes → `WgslCompositionError('symbol-conflict')` na criação.

## `composeWgsl` (C2, `scene/shaders/composeWgsl.ts`)

```ts
interface ComposedShader {
  readonly spec: ShaderModuleSpec; // congelado; mesmo objeto para a mesma entrada
  readonly modules: readonly string[]; // ordem de inclusão
  readonly symbols: ReadonlyMap<string, string>; // símbolo → módulo
}

function composeWgsl(entry: WgslModule): ComposedShader;

class WgslCompositionError extends Error {
  readonly kind:
    | 'cycle'
    | 'duplicate-module-name'
    | 'symbol-conflict'
    | 'struct-marker'
    | 'struct-conflict';
  readonly detail: readonly string[]; // caminho do ciclo, módulos envolvidos, símbolo…
}
```

Saída (texto de `spec.source`), determinística:

1. Structs gerados (`schema.toWGSL()`) de todos os `structs` do grafo, em ordem de primeira declaração (DFS),
   deduplicados por `wgslName` (mesmo `wgslName` com layout diferente → `struct-conflict`).
2. Fontes dos módulos em pós-ordem (dependências antes de dependentes; irmãos na ordem de `requires`), cada um uma vez,
   com os marcadores `{{struct:Nome}}` removidos depois de validados.

Regras:

- Ciclo → `cycle` com o caminho completo (`A → B → A`).
- Dois objetos `WgslModule` distintos com o mesmo `name` no grafo → `duplicate-module-name`.
- Símbolo definido por dois módulos (ou um módulo e um struct gerado) → `symbol-conflict` com o símbolo e os dois donos.
- `{{struct:Nome}}` sem schema com esse `wgslName` em `structs` do módulo ou de suas dependências → `struct-marker`.
- Resultado memorizado por `entry` (`WeakMap`); a montagem roda na criação dos recursos, nunca por quadro.
- Depois de montar, as chamadas a funções não definidas são verificadas contra `symbols` + builtins WGSL
  (substitui `validateWgslReferences`).

## Consumo pelos estágios (C2/C3/C4)

```ts
// createComputeKernel (scene/flows/createComputeKernel.ts)
interface ComputeKernelOptions {
  discriminator: string;
  shader: WgslModule; // antes: shaderSource: string
  entryPoint: string;
  bindings?: …; bindGroups?: …; preferAsync?: boolean;
}

// PipelineDescriptor (scene/descriptors/PipelineDescriptor.ts)
interface PipelineDescriptor {
  id: string; role: …; shader: WgslModule; // antes: shaderSource: string
  entryPoints: readonly string[]; consumes: readonly string[]; topology?: …;
}
```

- O `entryPoint` deve ser uma `fn` do módulo de entrada (verificado na criação do kernel/pipeline).
- `GpuEngineCore.compute()` (cópia sem validação de `createComputeKernel`) é removido; o smoke `limits` usa
  `createComputeKernel`.
- C1 inalterada: recebe `ShaderModuleSpec.source`.
- Materiais (`StandardMaterial`, `WireframeMaterial`, `PointSpriteMaterial`) e `PostProcessEffect.fragmentSource`
  passam a fornecer `WgslModule`; efeitos personalizados declaram `requires: [effectsBase]` em vez de concatenar.

## Módulos de base (C3, `elements/gpu/shaders/`; exportados por `elements` como `wgslLib`)

`wgslLib` é um objeto congelado `{ quat, linalg, mat, sdf, sph_kernels, mpm_weights, xpbd, lcp, fem, noise, color,
brdf, fixed_point, atomic_alloc }` — evita nomes genéricos soltos no barrel público.

| Módulo        | Requer           | Conteúdo (funções principais)                                                                                   |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `quat`        | —                | `quat_mul`, `quat_rotate_vec`, `quat_rotate_vec_inv`, `quat_normalize`, `quat_delta_omega`…                     |
| `linalg`      | —                | `mat3_det`, `mat3_inverse`, `mat3_transpose`, `mat3_mul`, `mat3_frobenius_norm`, `polar_decomp_quaternion`      |
| `mat`         | `quat`, `linalg` | `mat3_from_quat`, `mat3_from_cols`, `quat_to_mat4`, `mat4_upper3x3_transform`, `rigid_mat4_inverse`             |
| `sdf`         | —                | `sdf_sphere`, `sdf_box`, `sdf_plane`, `eval_sdf`, `sdf_gradient`                                                |
| `sph_kernels` | —                | `W_cubic`, `grad_W_cubic`, `laplacian_W_visc`, `W_poly6`, `grad_W_spiky`                                        |
| `mpm_weights` | —                | pesos quadráticos B-spline e gradientes                                                                         |
| `xpbd`        | —                | `rigid_generalized_mass`, delta-λ de restrição com compliance                                                   |
| `lcp`         | `quat`, `xpbd`   | matemática de contato e impulso (absorve `contact_math`, `impulse`)                                             |
| `fem`         | `linalg`         | `compute_Ds`, `compute_F`, `compute_J`, `grad_hydrostatic`, `grad_deviatoric`, `grad_node0`, `fem_delta_lambda` |
| `noise`       | —                | `pcg_hash`, `hash2`, `hash3`, `value_noise2/3`, `gradient_noise2/3`                                             |
| `color`       | —                | `tonemap_exposure`, `gamma_encode`, `luminance`                                                                 |
| `brdf`        | —                | `lambert_diffuse`, `ambient_term`, `sample_shadow_pcf`                                                          |

Suporte aos kernels genéricos: `fixed_point`, `atomic_alloc`, `reduceOp(op, type)` (ver
[compute-kernels.md](./compute-kernels.md)).

## Verificações no gate (Vitest, CPU)

- `wgslInventory.test.ts`: todo `.wgsl` sob `src/` é importado por exatamente um módulo TS.
- `wgslSymbols.test.ts`: nenhuma `fn`/`struct`/`const` definida em mais de um `.wgsl`, exceto pontos de entrada e
  structs de E/S de estágio em módulos de entrada distintos.
- Testes de `composeWgsl`: ordem, deduplicação, cada `kind` de erro, determinismo, memorização (mesmo objeto de spec).
