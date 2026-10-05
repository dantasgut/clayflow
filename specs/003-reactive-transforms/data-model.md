# Data Model — 003 Transformações reativas

Entidades da spec refinadas com campos, layouts, validações e transições. Contratos completos em
[contracts/](./contracts/).

---

## Transform (recurso — intenção do desenvolvedor)

| Campo      | Tipo (schema `Transform`) | Default        | Regra                                         |
| ---------- | ------------------------- | -------------- | --------------------------------------------- |
| `position` | `vec4f` (xyz, w=1)        | `[0, 0, 0, 1]` | qualquer real                                 |
| `rotation` | `vec4f` (quaternion xyzw) | `[0, 0, 0, 1]` | normalizado no estágio; módulo 0 ⇒ identidade |
| `scale`    | `vec4f` (xyz, w=1)        | `[1, 1, 1, 1]` | 0 colapsa; negativo espelha (ver `frontFace`) |

- Layout GPU: stride **48 B** (3 × 16), pool `Transform`, descritor `{ id: 'transform', role: 'storage-ro',
storage: 'pool', upload: 'always' }`.
- `model` **removido**. Construtor que receber `model` ⇒ aviso único por execução, valor ignorado.

## WorldTransform (produto do estágio — vive só na GPU)

| Campo    | Tipo      | Conteúdo                                                                      |
| -------- | --------- | ----------------------------------------------------------------------------- |
| `world`  | `mat4x4f` | `T(position) · R(normalize(rotation)) · S(scale)`, column-major               |
| `normal` | `mat3x3f` | `R · S⁻¹` (= inversa-transposta de `R·S`); componente com escala 0 ⇒ coluna 0 |

- Layout GPU: stride **112 B** (64 + 48), pool `WorldTransform`, descritor `{ id: 'world', role: 'storage-rw',
storage: 'pool', upload: 'never' }` — declarado pelo **mesmo** recurso `Transform`.
- Nunca escrito pela CPU; nenhum campo em `Transform.data`.

## Slot de recurso (ResourceSystem)

- Um recurso inserido recebe **um** slot, usado em todos os pools que declara (`Transform[i]` ↔ `WorldTransform[i]`).
- Origem do slot: free-list do primeiro pool declarado (LIFO não exigido; FIFO atual mantido); os demais pools crescem
  até cobrir o slot.
- Remoção libera o slot em todos os pools do recurso de uma vez.
- Crescimento: pool `'always'`/`'initial'` reempacota da CPU como hoje; pool `'never'` só realoca e emite
  `poolReallocated` (o produtor recalcula).

## Política de envio — `GPUDescriptor.upload`

| Valor                | Alocação  | Mutação de `data` depois                      | Estado do recurso após alocar                                                 |
| -------------------- | --------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `'always'` (default) | envia     | enfileira e envia no próximo `frameRecording` | `Ready`                                                                       |
| `'initial'`          | envia     | ignorada + aviso único por schema             | `GpuManaged` (se todos os descritores com schema forem `'initial'`/`'never'`) |
| `'never'`            | não envia | não se aplica                                 | — (não decide estado sozinho)                                                 |

Regra de estado: recurso com ao menos um descritor `'always'` ⇒ `Ready` (mutações desse descritor são enviadas;
descritores `'never'` nunca). Recurso cujos descritores com schema são todos `'initial'`/`'never'` ⇒ `GpuManaged`.

## Fila de sujos (ResourceSystem)

- Estrutura: `Set<Resource>` (dedup natural).
- Entrada: marcação automática (proxy) ou `emit('resourceDirty')` manual, se o handler do estado não ignora sujo.
- Saída: no evento `frameRecording`, para cada recurso: envia descritores `'always'` (pool → `write` no offset do
  slot; individual → `write` inteiro), estado `Dirty → Ready`, emite `resourceReady`; esvazia a fila.
- Recurso removido antes da saída: descartado da fila sem envio.

## Proxy reativo de `data`

- Instalado em `allocate` (estado `Uninitialized → Loading`), antes do envio inicial.
- Traps: `set`, `deleteProperty` (raiz e aninhados); `get` devolve proxy aninhado para `Array`/`TypedArray`
  (cache `WeakMap<object, proxy>`), métodos mutadores envolvidos.
- Efeito de qualquer mutação: `markDirty(resource)` → entra na fila (respeitando o handler do estado).
- Não rastreia referências capturadas antes da inserção (limite documentado).

## Eventos

| Evento            | Novo? | Emissor                                   | Payload                     | Quem reage                                                                                     |
| ----------------- | ----- | ----------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `frameRecording`  | sim   | ExecutionSystem, antes de `core.record`   | `{ elapsed: number }`       | ResourceSystem (esvazia fila)                                                                  |
| `resourceDirty`   | não   | proxy (auto) / app (manual)               | `{ payload: { resource } }` | ResourceSystem (enfileira)                                                                     |
| `resourceReady`   | não   | ResourceSystem (alocação e saída da fila) | `{ payload: { resource } }` | TransformFlow (marca `needsDispatch` se pool `Transform`)                                      |
| `poolReallocated` | não   | ResourceSystem                            | `{ poolKey, … }`            | TransformFlow (recria kernel + marca), Forward/Shadow (recriam bind group de `WorldTransform`) |

## Fases

`PHASE_ORDER = physics → transform → shadow → forward → post → ui` (nova fase `transform`).

## TransformFlow (estágio)

| Campo/estado    | Regra                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`         | `'transform'`                                                                                                                                                       |
| `needsDispatch` | `true` na criação; `true` em `resourceReady` de recurso do pool `Transform` e em `poolReallocated('Transform' \| 'WorldTransform')`; `false` após gravar o dispatch |
| `dispatch`      | se `needsDispatch` e `poolCount('Transform') > 0`: grava `ceil(count/64)` workgroups; senão nada                                                                    |
| kernel          | bindings `Transform` (read-only storage), `WorldTransform` (storage), `{ count }` (uniform)                                                                         |

## Consumidores (Forward / Shadow)

- Bind group único `@group(1)`: `array<WorldTransform>` read-only, visibilidade vértice, buffer do pool
  `WorldTransform`; recriado em `poolReallocated('WorldTransform')`.
- Por objeto: `firstInstance = poolSlotOf('WorldTransform', entityId)`; objeto sem slot ⇒ não desenhado no quadro.
- Variante de pipeline: `frontFace = (sx·sy·sz < 0) ? 'cw' : 'ccw'` (da intenção na CPU).
