# Quickstart: verificar a spec 039

## Gate

```bash
npm run lint && npx tsc --noEmit && npm test
```

Os testes de composição conferem:

- zero `material_fn_` nos kernels de traçado;
- exatamente uma em cada `hit_shade_*`;
- os mesmos kernels de traçado com 1, 3 e 16 grafos;
- a ida e volta do `closure_pack` contra a referência da CPU.

## Smokes do Chrome

São uma execução por vez, com o usuário informado. Depois de cada uma, conferir os processos em estado E.

```bash
npm run smoke -- nodeGraphs --headless
npm run smoke -- caustics --headless
npm run smoke -- globalIllumination --headless
npm run smoke -- refraction --headless          # inclui o custo (lente 1280×720, ≤ 3 ms)
npm run smoke -- fluidSurface --headless
npm run smoke -- readiness --headless           # engineReady; nenhum quadro compila depois dele
```

Critérios e fixtures atuais, sem regravar.

## Deno

1. **Só compilação**, sem submeter trabalho:

   ```bash
   deno run --unstable-webgpu -A bench/deno/compile.ts tanque
   ```

   Todos os pipelines são criados de forma assíncrona e `getCompilationInfo` é lido. Falha em erro ou em mais de 120 s por pipeline.

2. **Fora do repositório** (ferramenta do scratchpad): o MSL do naga pelo `makeLibrary` nativo, para os kernels novos.
3. **Com a aprovação do usuário**: uma execução da cena do tanque com vídeo (`deno task video agua` no claflow-web).
