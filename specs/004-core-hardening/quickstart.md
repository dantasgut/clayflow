# Quickstart: Endurecimento do núcleo

## Uso

```ts
import { Application } from 'clayflow';

const app = await Application.create({
  canvas,
  device: { powerPreference: 'high-performance', optionalFeatures: ['timestamp-query'] },
});
console.log(
  app.capabilities.adapter.description,
  app.capabilities.limits.maxStorageBufferBindingSize,
);

// Tempo
app.time.fixedDt = 1 / 120; // física em passos fixos de 1/120 s (determinística)
app.time.scale = 0.25; // câmera lenta (tudo)
app.time.pausePhysics(); // física parada, desenho continua
app.events.on('timeDropped', ({ dropped }) =>
  console.warn(`quadro lento: ${dropped}s descartados`),
);

// Sem laço (testes, pré-cálculo): 300 quadros de 1/60 s
app.step(1 / 60, 300);
```

## Migração (mudanças incompatíveis)

| Antes                                                                | Agora                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| Alterar uma spec depois de `core.create(spec)`                       | `TypeError` — crie uma spec nova                         |
| `scene.add(e); scene.add(e)` ou o mesmo `Material` em duas entidades | erro "instância já inserida — crie outra instância"      |
| Física avançava 1/60 s por quadro (velocidade dependia do monitor)   | avança pelo tempo; `fixedDt` default 1/60 com acumulador |
| Emitir `frameTick` à mão para avançar um quadro                      | `app.step(dt)`                                           |
| `Time` em `presentation/app`                                         | `Time` na C2, um por cena (`app.time` continua igual)    |
| Malhas com mais de 65 535 vértices quebravam                         | índices `uint32` automáticos                             |

## Validação

1. `npm test` — testes CPU de todas as frentes (ver research R15).
2. Smokes (servidor do bench, `src/__smokes__`): `time.ts` (30/60/144 Hz e `step()` × laço), `bigMesh.ts` (90 000
   vértices), `churn.ts` (100 × insere/remove 1 000 objetos, `memoryUsage()` estável), `transforms.ts` (regressão).
3. Build minificado: `npm run build:lib && npm run bench -- --dist --quick --scene unique-objects` e os smokes com
   `--dist`; resultado igual ao do código-fonte.
4. Desempenho: `npm run bench:check` (sem regressão contra `bench/baselines/`) e CPU por quadro de `instances/10k`,
   `instances/10k-moving` e `unique-objects/1k` ≥ 50% abaixo do baseline.
5. Gate completo.
