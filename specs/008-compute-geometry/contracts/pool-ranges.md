# Contrato — Faixas de pool, vivos e referências de slot (C2)

## Descritor em pool com `count`

```ts
{ id: 'body', role: 'storage-rw', storage: 'pool', schema, upload: 'initial', count: N }
```

- `count` ausente = 1 (comportamento de hoje, bit a bit).
- `data[desc.id]` com `count > 1`: registro SoA (um array por campo do schema, `componentes × N` elementos).
- `StructSchema.packRange(soa, start, n): Uint8Array` — AoS no layout do pool; `unpackRange(bytes, n)` — inverso.
- `count` não muda depois da inserção (mudar exige reinserir); a C2 lança erro se mudar.

## Alocação

- `chooseRange(pool, n)`: first-fit na lista de intervalos livres; senão o fim (`growPool` em laço).
- Faixas por pool em `Tracked.ranges: Map<poolKey, { first, span }>`; `slotOf(entity)` devolve `first`.
- `BoundPool.rangeOf(entity): { first, count } | undefined`.

## Vivos

- `BoundPool.live: StorageBufferSpec` (`array<u32>`, 1 bit por slot), escrito por delta.
- WGSL `poolLive` na `wgslLib`: `fn pool_live(live: ptr<storage, array<u32>, read>, i: u32) -> bool`.
- Solvers de partícula e a busca de vizinhança testam `pool_live`.

## Referências de slot

- `FieldType.slotRef(target: 'self:<descId>' | '<schemaName>')`.
- Valor: `{ body, index }` (alvo por schema) ou `index` (alvo `self`).
- Resolvido no empacotamento; reempacotado no `poolWritten` da faixa do alvo.
- Erros (na inserção ou na alocação do alvo): corpo fora do World, `index ≥ span`, pool errado — a mensagem nomeia a
  restrição, o corpo e o índice.

## Leitura

- `resources.read(resource, descId)` com `span > 1` devolve o registro SoA da faixa; `span = 1` como hoje.

## Garantias

- Corpo vivo nunca muda de slot.
- Slot morto nunca é visto como vivo pelos kernels (bit zerado no mesmo quadro da liberação).
- Trajetórias com um corpo por cena num World vazio idênticas às de uma entidade por partícula.
