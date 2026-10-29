# Data Model — Traçado em ondas (spec 039)

Todos os recursos de GPU seguem o contrato `Resource` (descriptor com `Schema`, `ResourceSystem`). Os tamanhos estão
em palavras de 32 bits.

## RayWave (Resource, `elements/raytrace`)

A onda compartilhada pelos consumidores (R5).

| Campo               | Tipo                   | Conteúdo                                                                        |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `capacity`          | u32 (dado)             | Registros por rodada: o maior pedido dos consumidores, limitado pelo adaptador. |
| `classes`           | u32 (dado)             | M = N funções + 2 (constantes de malha, volume).                                |
| `ray_wave_hits`     | `array<RayHitRecord>`  | `capacity` × 16                                                                 |
| `ray_wave_surfaces` | `array<RayHitSurface>` | `capacity` × 34                                                                 |
| `ray_wave_counts`   | `array<atomic<u32>>`   | `classes` + 1 (o total vivo)                                                    |
| `ray_wave_offsets`  | `array<u32>`           | `classes`                                                                       |
| `ray_wave_order`    | `array<u32>`           | `capacity`: os índices dos registros agrupados por classe                       |
| `ray_wave_args`     | `array<u32>`           | `classes` × 3, mais os do avanço: os argumentos indiretos                       |

Regras:

- `capacity` ≥ 1.
- Crescer a capacidade realoca a onda e emite o evento de recurso. Os consumidores refazem os grupos de ligação pelo evento.

### RayHitRecord (16)

| Palavras | Campo                                                                             |
| -------- | --------------------------------------------------------------------------------- |
| 0        | `ray`: identidade do raio no consumidor (índice do estado de caminho)             |
| 1        | `instance` (malha) ou a identidade de volume (bit `REFRACTION_VOLUME`)            |
| 2        | `class`: classe da separação (0 = constantes, 1..N = funções, N+1 = volume)       |
| 3        | `slot`: o `fn_slot` dos parâmetros                                                |
| 4–6      | `position`                                                                        |
| 7        | `t`                                                                               |
| 8–10     | `normal` (interpolada)                                                            |
| 11       | `width`: largura do cone (m; 0 = sem filtragem)                                   |
| 12–13    | `uv`                                                                              |
| 14       | `face`: o lado (±1), a bandeira de movimento (`moved`) e `renderable` empacotados |
| 15       | `renderable`: o registro de desenho (o fim do caminho da refração)                |

A direção de chegada fica no estado de caminho do consumidor, não no registro.

### RayHitSurface (34)

O `Closure` (67 floats) empacotado aos pares em `pack2x16float`, na ordem dos campos do struct. `closure_pack(c)` e
`closure_unpack(s)` ficam no módulo `closure`. A ida e volta é exata em f16 por campo.

## RayHitShading (Resource, `elements/raytrace`)

| Campo      | Conteúdo                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| `revision` | a `materialRevision` da `RayScene` atendida                                       |
| `kernels`  | por classe: o id do pipeline de material e se está pronto                         |
| `fallback` | o pipeline das constantes de malha, usado na faixa de uma classe ainda não pronta |

Evento: `rayHitShadingChanged` (classes ou prontidão mudaram).

## Estados de caminho (por consumidor, em pingue-pongue)

| Consumidor            | Estado (por raio vivo)                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GI sondas/tela        | a sonda ou o bloco e o raio, a origem e a direção, a semente                                                                                                     |
| Cáusticas, instâncias | a instância                                                                                                                                                      |
| Cáusticas, fótons     | a posição, a direção, a potência (vec3), o canal, o rebote, a flag especular, a semente e a pilha de meios (`RefractionStack`, quando o caminho atravessa meios) |
| Refração, câmera      | a câmera e os acertos enumerados (até 32)                                                                                                                        |
| Refração, pixels      | o pixel e a folha (`leaf`), a origem e a direção, a pilha de meios, o canal, as interfaces, o lado, o peso acumulado, o movimento, o par (lobo raro) e a semente |

## Folhas da refração e o fechamento por pixel

- **RefractionLeaf** (anexado ao terminar): o pixel, a folha, a radiância (vec3), a truncada (vec3), o movimento (vec3), o fim (vec4) e o albedo (vec3).
- **Fechamento:** `RadixSort` por pixel, depois a redução por segmento na ordem das folhas, gravando os alvos atuais da refração (radiância, fim, albedo, movimento, alfa).

## Prontidão (existente: `EngineReadiness`, C2)

Sem recurso novo. A `EngineReadiness` (`src/scene/readiness/EngineReadiness.ts`) já soma, por quadro, o que os Flows têm compilando e emite `enginePreparing`/`engineReady`. O que muda é que os pipelines (inclusive os kernels de material nos acertos) passam a ser declarados antes do quadro, de forma assíncrona. Assim `engineReady` cobre tudo o que a cena vai usar.

## PlatformAdapter (contrato C1)

Membro opcional `pipelineCache?`. Sem implementação nesta spec (R12).
