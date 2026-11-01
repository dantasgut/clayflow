# Estado de partida da 034 (T001)

Apple M4 (`apple-metal-3`), Chrome 155, `feature/034-refracao-fisica` com o código do `develop` `3a5ad83`,
2026-10-20.

## `npm run ci`

Verde.

## Smokes (31) — fonte e `--dist`

26 passam; as mesmas 5 falham no fonte e no `--dist`, todas herdadas (H1, H4, H5):

| Smoke                | Falha                                                                                                                              | Pendência |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `extensionPoints`    | xadrez com 0 trocas; olho de peixe curva 3,34 px (> 4 pedidos); hashes de estado `material/*` e `fisheye/*` divergem do manifest   | H4        |
| `fluidSurface`       | cáusticas agitadas 1,29× (≥ 1,3×); GPU 19,36 ms > 16,7 ms (medida com leituras repetidas)                                          | H5, H1    |
| `nodeGraphs`         | (a) grafo mais caro 0,363 × 0,237 ms (medida de GPU, H1); (c) cor da caixa 181 difere 109 de 255                                   | H1, H4    |
| `parametricSurfaces` | lago: 63 px mais claros e 35 mais escuros (2 % da água pedidos); hashes `lake/image`, `curvatureMaterial/image`, `adaptive/sphere` | H4        |
| `softSurface`        | `xpbd-cloth`: o corpo não aparece (46/189 px)                                                                                      | H4        |

## `npm run bench:check` (baseline `7f5605d`, perfil `apple-metal-3-chrome155-macos-1280x720-ifpfky`, tolerância 10 %)

Reprovado, herdado:

| Cena                  | Variante    | Métrica     | Baseline | Atual    | Δ       |
| --------------------- | ----------- | ----------- | -------- | -------- | ------- |
| `particles`           | 64k-terrain | frameMs.p99 | 37,83 ms | 43,92 ms | +16,1 % |
| `global-illumination` | off         | cpuMs       | 0,16 ms  | 0,20 ms  | +29,0 % |

Melhorias acima da tolerância: `instances/10k` CPU −16,7 %; `instances/10k-functions` p95 −33,4 %, p99 −15,1 %;
`surfaces/wave-uniform` CPU −10 %; `surfaces/wave-adaptive` CPU −60,8 %.

## Manchas da luz global (medida da spec, página temporária)

Ver a tabela do Contexto da spec; vira o smoke `giNoise` (T002).

## `giNoise` no estado de partida (T002)

| Caso             | Viés por face (pior) | Manchas | Cintilação |
| ---------------- | -------------------- | ------- | ---------- |
| `cornell-high`   | 7,92 %               | 8,80 %  | 1,22 %     |
| `cornell-medium` | 17,88 %              | 19,74 % | 2,81 %     |
| `window-high`    | 8,60 %               | ≤ 2 %   | ≤ 1 %      |
| `window-medium`  | 9,71 %               | 3,41 %  | 1,31 %     |

`fogWalk`: cintilação ≤ 1 %; periodicidade na escala do froxel 350,9× a de ruído sem estrutura (L7 confirmado).

## Depois da Fase 2 (prontidão, medida de GPU por quadro, marcações por camada)

Smokes no fonte (35 com `readiness`, `gpuTiming`, `deviceFloor` e `giNoise`): 28 passam; falham as 5 herdadas, o
`giNoise` (nasceu vermelho, US3) e o `fluidField`, que passou a medir de verdade:

| Medida                                     | Antes (leituras repetidas, CPU à frente) | Depois (uma leitura por quadro, no ritmo da GPU) |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------ |
| `fluidSurface` desempenho                  | 19,36 ms, falhava                        | 12,67 ms com 90 leituras distintas, passa        |
| `nodeGraphs` (a) custo do grafo            | 0,363 × 0,237 ms, falhava                | 0,385 × 0,369 ms, passa                          |
| `fluidField` campo + marcha da água a 64 k | passava (medida quebrada)                | 10,27–10,57 ms contra 2,5 ms — falha real        |
| `gpuTiming` (cômodo com GI `medium`, 720p) | —                                        | 180 de 180 quadros medidos; Flows cobrem 100 %   |

O custo da água pelo campo é desempenho do motor (registrado na 034 com H3, T068), não critério.

A captura do quadro no Xcode (árvore fase → Flow → passe) é manual: fica para o usuário conferir com a ferramenta de
captura do Metal; os grupos de depuração estão em toda gravação.

## Vídeos do estado de partida (T023)

Gravados pela ferramenta nova (`npm run video`, H.264 CRF 8, direto da GPU), 1280 × 720, enviados ao usuário: lente,
dispersao, agua, causticas, cornell, dia, nevoa, pano. Fidelidade (SC-010) nas cenas mais difíceis: Cornell brilho
52,79 dB e RGB contra o exato em 4:2:0 49,50 dB; água 53,04 / 48,69 dB; dispersão 61,05 / 56,97 dB; lente em 10 bits
60,58 / 57,95 dB. Falha forçada (cena inexistente): mensagem nomeando a cena e 0 processos órfãos.

## Depois da T078 (2026-10-31): a luz nos acertos da onda em kernel próprio

**Causa.** Desde a 039, o `Renderer` insere o recurso de cáusticas junto com o primeiro transmissivo. A luz direta no
acerto (`ray_direct` → `scene_caustic_lighting`) passou a ligar o hash das cáusticas, e a transmissão das sombras
acrescenta mais duas ligações. Nas cenas com vidro e luz global, o kernel das sondas que somava a luz direta e os
rebatimentos chegava a 11 buffers de storage (`gi_trace` 11 > 10). A falha escondia outra: a continuação da cadeia da
refração também chegava a 11 (`refraction_chain_follow`).

**Correção.** A luz nos acertos passou a ter um kernel próprio:

- **GI.** O `gi_wave_direct_main` grava, por raio, a luz direta e os fatores da luz rebatida do fechamento.
  `closure_indirect` é linear na luz de cada lobo, então a luz rebatida é `frente · e + verso · e_verso`. Os
  rebatimentos não leem mais o fechamento (368 B por raio).
- **Uma rodada da onda.** As sondas do mundo e as de tela passam numa rodada só, com as de tela nos índices seguintes.
  A colocação vem antes; os rebatimentos de tela continuam depois do acúmulo das sondas do mundo.
- **Refração.** O `refraction_chain_light_main` repete a escolha de `refraction_takes_interface` com o mesmo estado do
  sorteio (guardado na etiqueta do registro) e grava a luz do ponto opaco na carga do registro. O brilho das luzes
  (`refraction_glint`) continua na continuação.

**Ligações de storage sem contribuintes** (`LayoutInferencer`):

| Kernel                          | Antes | Depois |
| ------------------------------- | ----- | ------ |
| `gi_probe_trace`                | 9     | 6      |
| `gi_screen_trace`               | 9     | 6      |
| `gi_wave_direct` (novo)         | —     | 6      |
| `refraction_chain_light` (novo) | —     | 5      |
| `refraction_chain_follow`       | 7     | 7      |

A diferença na continuação da refração é o que ela não alcança mais: a luz indireta da GI (+1) e as cáusticas (+1).

**Achado no caminho.** O contribuinte da névoa a `ray_volume_transmittance` ainda tinha a assinatura de 3 argumentos.
O ponto ganhou `time` na T065d, e o erro ficava escondido pelo limite de ligações. Corrigido.

**Smokes** (Chrome, 10 buffers de storage por estágio):

- **`globalIllumination`: PASSA** (antes falhava por 11 > 10).
  - Cornell: 0,5–2,8 %, bloco baixo 7,6 %.
  - 4K: ≤ 0,8 %.
  - emissive: pior 5,5 %.
  - window: pior 8,8 %.
  - fornalha: 0,2 %.
  - vazamento: 0,069 %.
- **`deviceFloor`: PASSA** (`giGlassFog` e `giWater` sem erro).
- **Custo da GI** (caso `budget`, intercalado com a HEAD na mesma sessão):
  - antes: 3,82–3,95 ms;
  - depois: 3,84–3,91 ms.
  - Na primeira versão, a passada da luz direta despachava a grade da onda (512 grupos) e custava cerca de 0,1 ms a
    mais. Com uma invocação por raio, os raios de sombra têm invocações em voo como antes.
- **`caustics`** (`engine`, `water`, `shadow`): passam. O `water` a 0° dá 0,47–0,52 %, igual à HEAD (a diferença para
  a linha de base antiga da 039 não vem desta mudança).
- **`refraction`**: roda inteiro com 900 s de prazo (no gate da 039 estourava os 120 s). Falha nos mesmos critérios que
  a HEAD, medida na mesma sessão:
  - a fila tem um quarto do pedido (os representantes 2×2 da 039; o critério é de antes deles);
  - vagalumes do `glint` em 0,131 % (limite 0,05 %);
  - 1–2 degraus de borda;
  - GI desligada e ausente diferem 0,54 % (limite 0,5 %).
  - Os erros por região batem com a HEAD nas cenas estáticas; nas animadas variam com o quadro.
- **`giNoise`**: viés 6,55–19,65 %, manchas até 19,73 % (T059, sem mudança).
- **`fog`**: vidro dentro 65,9 % (pendência da 037, sem mudança).
