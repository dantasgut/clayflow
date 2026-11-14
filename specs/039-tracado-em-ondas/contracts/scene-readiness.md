# Contrato — compilação e prontidão da cena

## PipelineState (C2)

- **Criação assíncrona por padrão:** `createComputePipelineAsync` e `createRenderPipelineAsync`. O caminho síncrono só existe quando pedido (`sync: true`, testes).
- **Declaração:** os pipelines são declarados na resolução dos slots do Flow (`slotsResolved`). Um Flow que só conhece o pipeline no quadro declara no evento que o faz conhecer (ex.: `rayHitShadingChanged`), nunca no `framePrepare`.
- **Uso:** um pipeline não pronto não é usado. O Flow usa o substituto que tiver (raster: o pipeline base; material nos acertos: as constantes) ou pula o passe, como hoje.

## Prontidão: `EngineReadiness` e `engineReady` (existentes, C2)

- **Quando sai:** `engineReady` sai quando nenhum Flow ativo tem pipeline sem fonte, em conferência, compilando ou trocando. Com a declaração antecipada, isso inclui os kernels de material e os pipelines de raster de cada grafo da cena inserida.
- **Espera:** `Engine.whenReady()` resolve em `engineReady`.
- **Primeiro quadro:** o app que quer a fase de carga espera `whenReady()` antes do primeiro quadro visível. Nada obriga o app a esperar.
- **Depois de pronto:** um material novo em execução leva a `enginePreparing` até o kernel dele ficar pronto, sem travar quadro (o substituto das constantes).

## PlatformAdapter (C1)

```ts
interface PlatformAdapter {
  // …membros atuais…
  /** Cache de pipelines compilados entre execuções, se o ambiente oferecer (nenhum oferece hoje). */
  readonly pipelineCache?: PipelineCacheProvider;
}
```
