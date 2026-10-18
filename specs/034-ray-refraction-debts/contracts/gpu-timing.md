# Contrato: tempo de GPU por quadro (034, H1)

- `Application.create({ profiling: true | 'frame' | 'passes' })` como hoje.
- `frameComplete.stats.gpuTimeMs`, `gpuFrame`, `stagesNs`: presentes **só** no evento em que uma leitura nova chegou;
  `gpuFrame` é o índice do quadro medido (anterior ao evento, defasagem de 1–4 quadros). Cada quadro medido aparece em
  no máximo um evento.
- `EngineCore.lastFrameStats()`: a última leitura resolvida (para HUD e consultas avulsas).
- Sem `timestamp-query`: campos sempre ausentes (aviso único, como hoje).
- Igual em todo backend (Metal, D3D12, Vulkan); nenhum ajuste por fornecedor.
- Smokes: coletor por `gpuFrame` depois do aquecimento; medidor por repetição no relógio de parede com cerca para
  validar (`src/__smokes__/support/gpuTiming.ts`).
