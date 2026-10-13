# Contrato — Inferência de layout e resolução de `consumes`

## `LayoutInferencer` (C2, `scene/systems/LayoutInferencer.ts`)

```ts
parseWGSL(source: string): WgslBindingInfo                      // existente; estágios por alcance de chamadas
infer(composed: ComposedShader, entryPoints: readonly string[]): InferredLayout
```

`InferredLayout = { groups: readonly InferredGroup[] }`, `InferredGroup = { group, entries: readonly
InferredEntry[] }`, `InferredEntry = { binding, name, typeName, visibility, resource: 'uniform' | 'read-only-storage'
| 'storage' | { texture: sampleType, viewDimension, multisampled } | { storageTexture: format, access } | { sampler:
'filtering' | 'comparison' } }`.

- Visibilidade = estágios das entradas que alcançam (chamada transitiva) uma função que cita a variável.
- `typeName` = nome do struct (ou do elemento de `array<…>`), usado para `consumes`.
- Sem bindings não usados por nenhuma entrada listada: entram no layout com visibilidade das entradas que os citam;
  binding citado por nenhuma entrada é erro (shader com binding morto).

## `ConsumerResolver` (C2, `scene/consumers/`) — alterado

```ts
interface ConsumerResolver {
  readonly name: string; // = wgslName/schema.name consumido
  resolve(ctx: ResolveContext): ResolvedSource | undefined; // undefined = ainda ausente
}
interface ResolveContext {
  world: World;
  resources: ResourceDirectory;
}
```

Estratégias: `SingletonResolver(schema, descId, select?)`, `PoolResolver(poolKey)`, `TextureResolver(schema,
descId)`. `PerEntityResolver` sai (dados por entidade vêm de `slot.entities`).

Registro padrão (`createScene`): `Camera` (singleton: primeira câmera inserida que continua na cena), `Time`,
`ParticleMaterial`, `GravityField`; `PoolResolver` registrado automaticamente quando um pool é criado (qualquer schema
em pool é consumível pelo nome — `WorldTransform`, `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders,
restrições), sem sobrescrever resolver já registrado. Aplicações: `Application.create({ consumers: (r) =>
r.register(...) })`.

## Ordem de resolução de um binding (R3)

1. binding privado pelo nome da variável;
2. `typeName ∈ pipeline.consumes` → resolver;
3. erro `FlowBindingError`.

## `createComputeKernel` (C2) — alterado

`bindings` passam a ser `{ [varName]: ComputeKernelSource }` (`buffer` de qualquer papel, inclusive vértice, índice e
indireto; `dynamic?`; `size?`); layout inferido do WGSL. A forma por índice (`bindGroups[i].bindings[{ binding, type,
buffer }]`) sai.
