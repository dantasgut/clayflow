# Contrato — Transform e estágio de transformação (FR-006–FR-015)

## Recurso `Transform` (C3, público)

```ts
// elements/scene/Transform.ts
export class Transform extends Entity implements Resource {
  /** Intenção: posição, rotação (quaternion xyzw) e escala. */
  static readonly schema: StructSchema; // 'Transform' { position: vec4f, rotation: vec4f, scale: vec4f }
  /** Produto do estágio de transformação (GPU): matriz de mundo e de normais. */
  static readonly worldSchema: StructSchema; // 'WorldTransform' { world: mat4x4f, normal: mat3x3f }

  constructor(values?: { position?: Vec4; rotation?: Vec4; scale?: Vec4 });

  getDescriptors(): readonly GPUDescriptor[];
  // [ { id: 'transform', role: 'storage-ro', storage: 'pool', schema: Transform.schema,      upload: 'always' },
  //   { id: 'world',     role: 'storage-rw', storage: 'pool', schema: Transform.worldSchema, upload: 'never'  } ]
}
```

- **Incompatível**: `model` deixa de existir em `data` e no construtor (aviso único se fornecido).
- Posicionamento é sempre por posição/rotação/escala; a matriz é produzida pelo estágio.

## Estágio `TransformFlow` (C3)

```ts
// elements/scene/flows/TransformFlow.ts
export class TransformFlow extends Flow {
  readonly type = 'transform';
  readonly bodyType = '';
  readonly phase = 'transform'; // nova fase, entre 'physics' e 'shadow'
  constructor(core: EngineCore, pools: PoolDirectory, events: EventBus);
  dispatch(frame: Frame): void; // grava o compute só quando houve mudança
}
```

- Registrado por padrão (`registerPresentationDefaults`); substituível registrando outro Flow na fase `transform`
  (base dos pontos de extensão futuros: `Parent` na F2, função `transform` do usuário na F3, cadeia não euclidiana
  na F6).
- Matemática (kernel `transform_compose.wgsl`):
  - `q = normalize(rotation)` (módulo 0 ⇒ identidade);
  - `world = T(position.xyz) · R(q) · S(scale.xyz)` (column-major);
  - `normal = R(q) · diag(inv(sx), inv(sy), inv(sz))`, `inv(0) = 0`.

## Contrato de consumo (para estágios de render)

WGSL (gerado de `Transform.worldSchema`, mesma forma):

```wgsl
struct WorldTransform {
    world: mat4x4<f32>,
    normal: mat3x3<f32>,
}
@group(1) @binding(0) var<storage, read> worlds: array<WorldTransform>;

@vertex
fn vs_main(in: VsIn, @builtin(instance_index) slot: u32) -> VsOut {
    let w = worlds[slot];
    let world_pos = w.world * vec4<f32>(in.position, 1.0);
    // normal: w.normal * in.normal
}
```

Lado do estágio (TS):

```ts
const slot = pools.poolSlotOf('WorldTransform', entityId);
if (slot === undefined) continue; // ainda sem slot ⇒ não desenha neste quadro
pass.draw.indexed(indexCount, 1, 0, 0, slot); // firstInstance = slot
```

- Bind group recriado em `onPoolReallocated('WorldTransform')`.
- `frontFace: 'cw'` quando `sx·sy·sz < 0` (variante de pipeline), senão `'ccw'`.

## Física

- `LCPFlow` publica apenas `transform.data.position` e `transform.data.rotation` (proxy marca sujo); não escreve
  matriz, não acessa membros privados; escala do desenvolvedor preservada.
- Pools de `RigidBody`/`SoftBody`/`FluidBody` declaram `upload: 'initial'`.

## Testes (Vitest, CPU)

- `Transform`: schema sem `model`; aviso único com `model`; dois descritores com políticas corretas.
- `FlowRegistry`: `phasesInOrder()` inclui `transform` entre `physics` e `shadow`.
- `TransformFlow` (core mockado): despacha na criação; não despacha sem mudança; despacha após `resourceReady` de
  `Transform`; ignora `resourceReady` de outros recursos; recria kernel e despacha após `poolReallocated`;
  workgroups = `ceil(count/64)`.
- Forward/Shadow (passes mockados): `firstInstance` igual ao slot; nenhum `write` de transform por objeto por quadro;
  variante `cw` para escala negativa; bind group recriado em `poolReallocated('WorldTransform')`.
- Oráculo CPU (só no teste/smoke) de `T·R·S` e `R·S⁻¹` para comparar com o readback do pool `WorldTransform`.
