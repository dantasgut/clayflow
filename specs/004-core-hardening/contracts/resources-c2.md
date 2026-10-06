# Contrato C2 — alocação, ciclo de vida e World

## Alocação por papel

Todo `GPUDescriptor` de um Resource inserido é alocado (ver tabela em research R9), um registro por descritor.

```ts
/** Localiza o que a C2 alocou para (recurso, descritor). Consumido pelos estágios (migração na 006). */
interface ResourceDirectory extends PoolDirectory {
  bufferOf(resource: Resource, descId: string): AnyBufferSpec | undefined;
  textureViewOf(resource: Resource, descId: string): TextureViewSpec | undefined;
  samplerOf(resource: Resource, descId: string): SamplerSpec | undefined;
}
```

- `vertex`: conteúdo = `resource.data[desc.id]` (typed array intercalado); `stride` = `schema.vertexLayout.stride`.
- `index`: conteúdo = `resource.data[desc.id]`; `format` = `'uint32'` se `Uint32Array`, senão `'uint16'`.
- Mutação de `data[desc.id]` (atribuição) → reenvio no próximo `frameRecording`, como os demais papéis.
- Crescimento de pool destrói o bind group anterior.

## Ciclo de vida

- Toda mudança de estado passa por `transition(resource, to)`; transição fora de `validTransitions` lança `Error`
  com estado atual, destino e recurso.
- Envio pela CPU consulta `handler.suppressCpuUpload()`; marcação de sujo consulta `handler.ignoreDirtyMark()`.
- `Destroyed → Uninitialized` é válida (reinserção após remoção).

## World

```ts
insert(entity: Entity): EntityId; // lança ReuseError (mensagem: "instância já inserida — crie outra instância")
```

Lança quando: a raiz está inserida; um recurso da árvore pertence a outra raiz viva; um recurso aparece duas vezes na
árvore. `remove` libera os recursos para nova inserção. O mapa recurso → entidade é do World (não global).

## Estágios e descarte

- `FlowRegistry.unregister(flow)` remove o estágio e chama `flow.dispose?.()`.
- `onEntitiesRemoved` dos estágios destrói os objetos de GPU por entidade que criaram.
- `SceneContext.dispose()` descarta sistemas (inscrições), estágios e o core; `Application.dispose()` desfaz o que a
  aplicação registrou numa cena compartilhada: os estágios padrão são registrados uma vez por cena e desregistrados
  quando a última aplicação que os usa é descartada; ouvintes da aplicação saem no seu próprio descarte.
