# Quickstart: verificar a spec 038

## Motor

```bash
cd clayflow
npm run lint && npx tsc --noEmit && npm test          # sem regressão (1851 testes no início)
npm run build:lib                                     # dist/ com index, web e deno
deno test --unstable-webgpu bench/deno/core.test.ts   # o núcleo carrega e monta o motor sem DOM (SC-002)
deno run --unstable-webgpu -A bench/deno/naga.ts      # todos os shaders compilam no naga (SC-005)
npm run smoke -- <os que passavam> --headless         # as mesmas imagens e números (SC-004)
```

Conferir: nenhuma cena de vídeo nem página de demonstração no motor (`src/__smokes__/videoScenes.ts`,
`bench/runner/video.ts`, `bench/agua.html`, `index.html`/`src/main.ts` fora — SC-001).

## App

```bash
cd ../clayflow-web
npm install
npm run dev                                 # http://localhost:5173/?scene=agua
npm run video -- agua --frames 60 --lossless
deno task video agua --frames 60            # pelo Deno (SC-006)
```

Conferir: os hashes dos 60 primeiros quadros de cada cena iguais aos gravados pelo motor antes da migração (SC-003).
