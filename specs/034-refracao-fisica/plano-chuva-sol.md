# Chuva e sol: luz através da água e do vidro, cáusticas, dispersão e arco-íris

Registro da conversa de 2026-10-27 (spec 034). Não é tarefa aberta ainda: o início é decisão do usuário.

## Onde estamos

- **Luz global**: existe (sondas da 033, GI de tela). O que falta é a luz **atravessar** os dielétricos: o raio de sombra
  do traçado (`ray_scene_trace` em `ray_light_response`) e os fótons da GI (`gi_photon_trace.wgsl`) param em toda
  instância que não é volume — vidro e água inclusive. O fundo visto pela água só recebe a luz rebatida, e a luz do sol
  não entra na água (nem no meio dela: a cor da água funda, T065c). É a T067 junto da T057.
- **Cáusticas "pelo material"**: no plano da T067c, as cáusticas são **transporte de luz**, não parâmetro do material. A
  superfície refratora vem do mesmo `ray_volume_hit`/malha e do mesmo fechamento do grafo que a refração usa (Fresnel,
  IOR, Abbe, absorção) — o material define o que acontece na superfície, sem um ajuste paralelo de cáustica; ligar e a
  intensidade ficam num recurso de transporte de luz (como `Refraction`).
- **O desvio de cor é dispersão, não difração**: o índice de refração muda com o comprimento de onda (número de Abbe).
  Já existe no traçado da câmera (`refraction_trace.wgsl`, vídeo `dispersao`), não no transporte de luz.
- **Difração** (arcos supranumerários, glória, coroa) é óptica ondulatória: fora do modelo de raios. Possível depois
  pela teoria de Airy para a gota; não é necessária para o arco principal.

## Por que o arco-íris é o mesmo problema das cáusticas

O arco é a luz do sol que entra na gota, reflete uma vez dentro dela e sai a ~42° da direção oposta ao sol (Descartes;
~51° no secundário, com duas reflexões). Para a câmera vê-lo, o caminho que sai dela precisa atravessar a gota, refletir
e sair **exatamente** na direção do sol: com o sol quase pontual, o traçado a partir da câmera quase nunca acha esse
caminho (a amostragem da luz não atravessa cadeias especulares). É um caminho especular–especular até a luz — o
transporte das cáusticas. Com a dispersão por comprimento de onda no transporte, o arco sai com as cores na ordem e na
largura certas.

## A chuva

Gotas de chuva têm 1–5 mm; as partículas do fluido, 1,25 cm. A chuva não é o fluido SPH/PBF:

- gotas emitidas (`EmitFunction`) como nuvem de partículas com a velocidade terminal pelo diâmetro (Gunn e Kinzer
  1949: ~4 m/s a 1 mm, ~9 m/s a 5 mm) e a distribuição de tamanhos de Marshall–Palmer pela intensidade da chuva;
- vistas pelos raios como **esferas exatas** (interseção analítica, IOR e Abbe da água), não pelo campo dos fluidos;
- a gota que bate num sólido alimenta a película (T066d): o chão molha, o concreto absorve e escurece, a água junta
  e escorre no vidro, o sol (com o `Atmosphere`) seca;
- o respingo da gota (T066b) é a mesma física do limiar de Mundo.

## Plano proposto

1. **T067a**: a referência por traçado a partir da luz, com muitas amostras, para a água agitada, a água parada e a
   esfera de vidro; antes, os dois limites do meio da T065c (atenuação por canal no voo livre; absorção do dielétrico
   só até o espalhamento).
2. **T067b**: medir os dois caminhos existentes (o splat da vista da luz e os fótons da GI) contra a referência — fluxo,
   foco, tempo no M4, estabilidade — e escolher.
3. **T067c + T057**: implementar o escolhido, com a **dispersão por comprimento de onda** no transporte (o índice do
   canal em cada interface, como no traçado da câmera) e a entrada de espalhamento no meio.
4. **Chuva**: as gotas emitidas como esferas nos raios, alimentando a película.
5. **Cena "chuva e sol"** com critérios medidos:
   - o arco primário no ângulo de Descartes pela dispersão da água: ~42,3° no vermelho (656 nm, n ≈ 1,331) e ~40,6°
     no violeta (405 nm, n ≈ 1,343), a ±0,3°; o secundário a ~50–53° com as cores invertidas e mais fraco;
   - as cáusticas contra a referência da T067a;
   - a película: o chão molhando pela taxa da chuva e secando pela de Carrier.
6. Vídeo da cena.
