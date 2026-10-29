---
description: 'Tarefas da 039 refeita — água em tempo real com trabalho fixo por pixel'
---

# Tasks: 039 refeita

Já feito na primeira versão e mantido: a onda dos acertos (`RayWave`, `hitShade`, a separação por classe), o material
fora dos kernels de GI e cáusticas, o meio homogêneo por corpo, o `whenReady` com espaço na GPU.

**Regra da GPU**: uma execução por vez; conferir processos em `E`/`U`; parar a série se uma compilação ou espera passar
de ~2 min.

## Phase 1: Medição

- [x] T101 Tanque do motor anterior à 039 por estágio no `baseline.md` (133,6 ms; refração 92,5; cáusticas 22,8).
- [ ] T102 [US6] O app liga a medição por passe (`profiling`) e mostra a tabela por estágio; o mesmo no smoke do tanque.

## Phase 2: US3 — a cadeia fixa por pixel (P1)

- [x] T103 [US3] `refraction_chain.wgsl`: o estado por pixel, os estágios câmera → reflexão → transmissão (até
      `REFRACTION_CHAIN`) → canais da dispersão → fim, sobre `refraction_node_at`; a radiância, o fim, o albedo e o
      movimento nos alvos atuais.
- [x] T104 [US3] `RefractionFlow`: os estágios com a onda de tamanho fixo (pixels da fila); sai a fila de caminhos, as
      folhas, a ordenação e `refraction_wave.wgsl`.
- [ ] T105 [US3] Testes de composição (despachos fixos, nenhuma função `material` no traçado, teto dos laços).
- [ ] T106 [US3] Smoke `refraction` com os critérios atuais e o custo da lente (≤ 3 ms); o tanque no app sem verde.

## Phase 3: US2 — a malha da superfície (P1)

- [ ] T107 [US2] `FluidSurfaceMesh` + `FluidSurfaceMeshFlow` + `field_mesh.wgsl` (tetraedros marchantes nos blocos
      ocupados, vértice de 8 bytes, desenho indireto, estouro por evento).
- [ ] T108 [US2] O pedido da água pelo raster da malha no lugar da marcha por pixel; a entrada da cadeia pelo alvo.
- [ ] T109 [US2] Smoke da superfície: vértices contra o nível zero; profundidade contra a marcha de referência.

## Phase 4: cáusticas e física

- [ ] T110 Cáusticas por kernel medidas; a transmitância analítica pelo meio homogêneo; meta ≤ 2 ms no tanque.
- [ ] T111 [US5] Vizinhança do PBF por intervalos contíguos com reordenação; física ≤ 4 ms.

## Phase 5: Fechamento

- [ ] T112 O tanque por estágio no `baseline.md` (SC-001) e a comparação de imagem com o motor anterior (SC-003).
- [ ] T113 Vídeo do tanque no Chrome; no Deno com aprovação (SC-006).
- [ ] T114 Gate completo: lint, tsc, testes, smokes.
