# Contrato — Dado reativo de recursos (FR-001–FR-005)

Capacidade genérica da C2: qualquer recurso inserido na cena reage a mutações do seu `data`.

## Semântica para quem usa o motor

```ts
const cube = new BoxGeometry({ size: [1, 1, 1] })
  .add(new StandardMaterial({ albedo: [0.8, 0.4, 0.2, 1] }))
  .add(new Transform({ position: [0, 0, 0, 1] }));
app.world.insert(cube);

const t = /* o Transform do cubo */;
t.data.position = [5, 0, 0, 1];   // atribuição de campo → sujo
t.data.position[1] = 2;           // componente → sujo (mesmo quadro: um único envio)
material.data.albedo[0] = 1;      // vale para qualquer recurso
```

- A mudança aparece no **quadro seguinte**, sem chamada adicional.
- Várias mutações no mesmo quadro ⇒ **um** envio, com o último valor.
- Recurso ainda não inserido: mutações não geram eventos (o valor vai no envio inicial da inserção).
- Recurso removido: mutações são ignoradas.
- `emit('resourceDirty', { payload: { resource } })` manual continua aceito (compatibilidade) e entra na mesma fila.
- `TypedArray`/`ArrayBuffer` (vértices, índices) são devolvidos crus — APIs nativas da GPU não aceitam Proxy;
  mutação no lugar não é rastreada, reatribua o campo (decisão revista na implementação, ver research R1).
- Limite: referência a array interno capturada antes da inserção não é rastreada — mute via `data.campo[i] = …` ou
  reatribua o campo.

## Política de envio por descritor

```ts
// scene/descriptors/GPUDescriptor.ts
export interface GPUDescriptor {
  // …existentes…
  /**
   * Quem escreve o buffer deste descritor:
   *  - 'always'  (default): a CPU envia na alocação e a cada mutação de `data`.
   *  - 'initial': a CPU envia só na alocação; depois a GPU é dona (o recurso entra em GpuManaged
   *               e mutações são ignoradas com um aviso).
   *  - 'never'  : produzido só pela GPU; a CPU nunca escreve.
   */
  readonly upload?: 'always' | 'initial' | 'never';
}
```

## Eventos

```ts
// scene/events/EventMap.ts
export interface FrameRecordingEvent {
  /** Tempo acumulado da simulação (s), igual ao do frameTick que originou o quadro. */
  readonly elapsed: number;
}
export interface EventMap {
  // …existentes…
  /** ExecutionSystem emite antes de gravar o quadro — ResourceSystem envia os recursos sujos. */
  frameRecording: FrameRecordingEvent;
}
```

Ordem garantida por quadro: `frameTick` → `frameRecording` (envio dos sujos + `resourceReady`) → `core.record`
(estágios por fase) → `core.submit` → `frameComplete`.

## Contrato de consulta a pools (C3/C4)

```ts
// scene/contracts/PoolDirectory.ts — implementado por ResourceSystem
export interface PoolDirectory {
  /** Buffer do pool (para bind groups de estágios). */
  poolBufferSpec(poolKey: string): StorageBufferSpec | undefined;
  /** Número de slots ocupáveis (maior slot + 1). */
  poolCount(poolKey: string): number;
  /** Slot da entidade no pool; o mesmo em todos os pools de um mesmo recurso. */
  poolSlotOf(poolKey: string, entityId: EntityId): number | undefined;
  /** Pool key do recurso (primeiro descritor em pool) ou undefined. */
  poolKeyForResource(resource: Resource): string | undefined;
}
```

## Testes (Vitest, CPU)

- Proxy: atribuição, componente, `Array` (`splice`, `fill`, `sort`, `reverse`), `TypedArray` devolvido cru, `delete`; proxy
  aninhado estável (`data.position === data.position`); não inserido ⇒ sem evento; removido ⇒ ignorado.
- Fila: 10 mutações no mesmo recurso ⇒ 1 `core.write` no `frameRecording`; `resourceReady` emitido uma vez.
- Política: `'always'` envia; `'initial'` envia só na alocação, estado `GpuManaged`, mutação ignorada com aviso único;
  `'never'` nunca escreve (nem na alocação, nem no crescimento).
- Slot comum: inserção intercalada, remoção e reinserção, crescimento além de 16 — `poolSlotOf` igual entre os pools
  do recurso.
