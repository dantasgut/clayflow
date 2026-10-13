# Contrato — Estado de cena na GPU (C2)

## Dedup de geometria (R1)

- `Geometry.contentKey: string` (C3). A C2 usa `${desc.id}:${schema.name}:${contentKey}` como discriminador dos
  descritores `vertex`/`index` de uma geometria; a C1 deduplica pela spec e controla a vida por posse (`retain` na
  segunda entidade, `release` na saída; destrói na última).
- O conteúdo é escrito só na criação da spec. `data.vertices`/`data.indices` atribuídos depois da inserção recalculam
  a chave; chave nova → `release` da antiga, `create`/`retain` da nova, `resourceReady` da geometria (individual) e
  reavaliação do grupo das entidades dela.
- `bufferOf(geometry, 'vertices' | 'indices')` continua devolvendo o buffer (agora compartilhado).

Erros: geometria sem `contentKey` resolvível (arrays ausentes) → erro na inserção nomeando a entidade.

## Grupos de instâncias (`slot.entities({ groups })`, R2)

```ts
groups: {
  key: (entry: EntityEntry) => string;
  instance: 'record' | readonly[(ResourceType, string)];
}
```

- A C2 avalia `key` na entrada do conjunto, na troca de um Resource da entidade e no envio de um Resource do conjunto
  (só as entradas enviadas no quadro). Chave mudou → a entrada sai do grupo antigo (troca com o último) e entra no
  novo.
- `instance: 'record'` grava o slot do registro (exige `record`); `[Type, descId]` grava o slot de pool do descritor.
  Mudança desse slot (realocação de pool não muda slots; troca de Resource muda) atualiza a entrada.
- Escritas na lista: agrupadas em faixas no `frameRecording`, como os registros (`flushRecords`).
- `BoundEntities.groups` só com grupos não vazios; `BoundEntities.instances` é um `BoundPool` (`array<u32>`).
- Crescimento da lista: dobra, `poolReallocated { poolKey: '<conjunto>:instances' }` e `bindGroupReplaced`.

Invariantes (testadas): toda entrada do conjunto está em exatamente um grupo; `Σ count = |conjunto|`; os segmentos não
se sobrepõem; com a cena parada, `framePrepare`/`frameRecording` não percorrem entradas.

## Envio por delta (R5)

- Pool `'always'`: `markDirty(resource)` marca o slot (`slotOfResource`, O(1)); `frameRecording` empacota os sujos no
  espelho e escreve faixas contíguas (uma `core.write` por faixa), pulando slots de posse da GPU.
- `poolWritten { poolKey, ranges }` uma vez por pool por quadro, entregue só aos runtimes que consomem o pool ou o
  declaram em `listens`.
- Crescimento: `Frame.copy(old → new)` na GPU, no `frameRecording` seguinte; espelho por cópia; sem reempacotar.
- Mutação repetida no quadro: o último valor (empacotado no `frameRecording`).

## Posse por conjunto (`owns`, R7)

- `owns: [[Transform, 'transform']]` num `slot.entities`: para cada entidade do conjunto, o slot daquele descritor fica
  com posse da GPU depois do primeiro envio. Mutação de `data` → aviso único por Resource; nada é enviado.
- Saída do conjunto → posse volta à CPU e o dado de intenção é reenviado no quadro.
- Dois conjuntos não podem possuir o mesmo descritor da mesma entidade (erro nomeando os Flows).

## Leitura sob demanda (R8)

`world.read(resource, descId?)`, `world.readAll(resources, descId?)` → `Promise`. Pedidos do quadro agrupados por pool;
cópia para staging no `frameRecording`; `mapAsync` depois do envio; desempacotados pelo schema. Resource removido
antes da resposta → `undefined`. Nenhuma leitura sem pedido.

## Eventos agregados (R6)

`entitiesChanged` por conjunto e por quadro (`added`, `removed`), aplicado em `framePrepare`; inserção em massa linear.
