# Quickstart — Harness de Benchmark

## Pré-requisitos

- Google Chrome (ou Edge) instalado, com WebGPU habilitado.
- `npm install` (instala `three`, `@dimforge/rapier3d-compat`, `playwright`, `tsx` como devDependencies — o
  Playwright usa o Chrome da máquina, não baixa navegadores).
- Feche outras abas/apps pesados; deixe o notebook na tomada (throttling térmico gera ruído).

## 1. Rodar o comparativo

```bash
npm run bench -- --quick          # ~2 min, para iterar
npm run bench                     # ~10 min, protocolo completo (3 s aquecimento, 10 s janela, 3 repetições)
npm run bench -- --scene instances --engine clayflow --variant 10k,100k
```

Abre uma janela do Chrome, roda cada cena × variante × engine em página isolada e gera
`bench/results/latest.md` (tabela) e `latest.json` (dados).

## 2. Gravar o baseline da sua máquina

```bash
npm run bench:baseline
git add bench/baselines/ && git commit -m "perf(bench): baseline <perfil>"
```

## 3. Verificar regressões (gate local)

```bash
npm run bench:check               # exit 1 se o clayflow piorou > 10% em alguma métrica
npm run bench:check -- --from bench/results/latest.json   # sem reexecutar
```

Faz parte do gate local de qualquer mudança em renderização/física (o CI não tem GPU).

## 4. Usar a observabilidade do motor na sua app

```ts
const app = await Application.create({ canvas, profiling: true });
app.events.on('frameComplete', ({ dt, stats }) => {
  console.log(
    `CPU ${dt.toFixed(2)} ms · GPU ${stats.gpuTimeMs?.toFixed(2) ?? 'n/d'} ms · ${stats.drawCalls} draws`,
  );
});
```

## 5. Adicionar uma cena

1. Crie `bench/scenes/<id>/scene.ts` com a `SceneDefinition` (id, variantes, câmera, seed).
2. Crie `clayflow.ts` e `three.ts` implementando `SceneImplementation` — ou declare
   `{ unsupported: 'motivo', until: 'F5' }` para a engine que ainda não suporta.
3. Registre em `bench/core/catalog.ts`. Pronto: executor, métricas, relatório e baseline já a incluem.

Regras: conteúdo só a partir de `rng` e `variant.params`; lado clayflow importa apenas de `clayflow`.

## Validação desta feature

- `npm run bench -- --quick` termina com as 5 cenas reportadas (incluindo "não suportado" para luzes e
  personagens no clayflow).
- Duas execuções completas seguidas: medianas diferem ≤ 5%.
- Inserir `busyWait(+15%)` temporário numa cena clayflow → `bench:check` reprova; remover → passa.
- `npm pack --dry-run` não lista `bench/`; `dependencies` continua só `uuid`.
- Gate completo: lint → format → madge → knip → tsc → testes + coverage → doc-coverage → build:lib, mais
  `typecheck:bench`.
