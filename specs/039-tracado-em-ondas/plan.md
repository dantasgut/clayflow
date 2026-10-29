# Implementation Plan: 039 refeita — água em tempo real com trabalho fixo por pixel

**Branch**: `feature/039-tracado-em-ondas` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

## Summary

Refazer o caminho da luz dos transmissivos (água e vidro) com trabalho fixo por pixel, o primeiro acerto da água pela
rasterização de uma malha extraída na GPU, e as otimizações do Particles4All que se aplicam ao motor (vizinhança por
intervalos contíguos, malha compacta com desenho indireto, medição por passe). O material continua fora dos kernels de
traçado, numa onda de tamanho fixo por estágio. A ordem segue o custo medido no tanque (`baseline.md`): refração
92,5 ms → cáusticas 22,8 ms → primeiro acerto e campo → física.

## Technical Context

- **Language/Version**: TypeScript 5 (strict), WGSL; WebGPU (Chrome/Dawn, Deno/wgpu).
- **Testing**: vitest (composição de kernels e unidade); smokes de GPU no Chrome headless; a cena do tanque no app.
- **Target**: M4 (piso) e RTX 4090; 1280×720 a 60 Hz no tanque (SC-001).
- **Constraints**: regra dura da GPU (todo laço com teto); nada na CPU; adaptativo pelo adaptador; Resource + evento +
  Flow; critérios e fixtures sem afrouxar.

## Decisões técnicas

### D1 — A cadeia fixa por pixel (substitui a árvore de caminhos)

Cada pixel da fila de refração percorre estágios fixos; cada estágio é: o acerto de um raio por pixel (BVH + marcha do
campo, sem material) → a onda (uma entrada por pixel: tamanho fixo = pixels pedidos) → o material por classe → a
continuação. Estágios:

1. **Câmera**: o acerto da câmera (para a água, a entrada vem do raster quando D3 estiver pronta).
2. **Reflexão da 1ª interface**: um raio refletido, traçado até o primeiro opaco ou o ambiente (o acerto sombreado
   como hoje: luz direta, cáusticas, indireta).
3. **Transmissão**: até `REFRACTION_CHAIN` interfaces (8) em linha: em cada interface o lobo pela roleta de Fresnel
   (sem viés; o filtro temporal já existe), a pilha de meios e a absorção analítica pelo comprimento; reflexão interna
   total segue a reflexão. A borda que não muda o meio segue reto.
4. **Dispersão**: na saída de um meio que dispersa, o caminho abre três canais (três raios finais fixos); antes dela, o
   caminho é de um canal só.
5. **Fim**: o opaco ou o ambiente.

Por pixel: no máximo 1 + 1 + 8 + 3 acertos, cada um um despacho de tela; o estado por pixel é pequeno (a origem, a
direção, o peso, a pilha de meios, a radiância somada). Nenhuma fila, nenhuma vaga, nenhuma folha, nenhuma ordenação. O
número de despachos por quadro é fixo.

### D2 — A onda por estágio

`RayWave` com capacidade = pixels da fila (cresce pelo pedido); um estágio usa a onda inteira. Os kernels de material por
classe e o substituto das constantes como hoje.

### D3 — A malha da superfície e o raster

`FluidSurfaceMesh` (Resource): tetraedros marchantes por voxel dos blocos ocupados do campo atual; vértice em 8 bytes
(posição de 16 bits por eixo na caixa do campo, normal octaédrica de 8+8 bits); contagem atômica e argumentos do desenho
indireto escritos na GPU; estouro sinalizado num contador lido de forma assíncrona → evento → a capacidade cresce.
Desenhada no alvo da água (profundidade e normal) no lugar do pedido por marcha; a câmera dentro da água pelo verso.

### D4 — Cáusticas

Medir por kernel; aplicar a mesma regra: nenhum fóton paga a marcha mais de uma vez por rebote; a transmitância pelo
meio homogêneo é analítica pelo comprimento.

### D5 — Física

A busca de vizinhos do PBF por 9 intervalos contíguos sobre as partículas reordenadas pela célula a cada subpasso.

### D6 — Medição

O profiling por passe que já existe (`setFrameProfiling`, `takeFrameTimings`) ligado pelo app; os tempos dos passes de
compute por estágio no `baseline.md` a cada passo. No Apple, os passes de render se sobrepõem: o quadro inteiro pelo
intervalo do primeiro início ao último fim.

## Constitution Check

- Resource + evento + Flow: a malha é Resource, o estouro é evento, cada estágio é Flow ou passe de um Flow.
- Nada na CPU: a malha, a contagem e os argumentos na GPU.
- Regra dura: os laços da cadeia têm teto (`REFRACTION_CHAIN`, os passos da marcha, o laço da BVH).
- Sem afrouxar: os critérios atuais; a cena que o orçamento fixo não cobre vai ao usuário com a medida.

## Project Structure

- `src/elements/lighting/refraction/` — `RefractionFlow.ts` (a cadeia fixa), `refraction_chain.wgsl` (novo), o que
  sai: `refraction_wave.wgsl`, a fila de caminhos, a ordenação das folhas.
- `src/elements/fields/` — `FluidSurfaceMesh.ts`, `FluidSurfaceMeshFlow.ts`, `field_mesh.wgsl` (novos).
- `src/presentation/flows/RefractionVolumeRequestFlow.ts` — pelo raster da malha.
- `src/elements/physics/` — a busca de vizinhos.
