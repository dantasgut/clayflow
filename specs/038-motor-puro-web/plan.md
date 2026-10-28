# Implementation Plan: Motor puro e o app clayflow-web

**Branch**: `feature/038-motor-puro-web` (de `feature/034-refracao-fisica`, volta por merge) | **Date**: 2026-10-28 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/038-motor-puro-web/spec.md`

## Summary

Separar o motor (capacidades) das cenas (conteúdo) e do ambiente (navegador ou Deno). O núcleo do motor deixa de
depender do DOM: a superfície de apresentação vira contrato da C1 (`PresentationSurface`: canvas, textura com leitura
de volta, janela do Deno), obtida com o adaptador da GPU por um `PlatformAdapter` (padrão adapter, decisão do usuário), o laço de quadros e a entrada viram contratos da C4 (`FrameClock`, `InputSource`), e dois
pontos de entrada montam o motor para cada ambiente (`clayflow/web`, `clayflow/deno`). As cenas de vídeo, o gravador e
as páginas de demonstração saem para o app `clayflow-web` (o `claflow-web` renomeado, sem as cenas antigas). O Deno
consome o motor construído; um smoke mede a compilação dos shaders no naga. Os smokes e o benchmark ficam no motor.

## Technical Context

**Language/Version**: TypeScript 5.9 estrito; WGSL; Deno 2.7.9 (wgpu) como segundo ambiente
**Primary Dependencies**: WebGPU (navegador: Dawn no Chrome; Deno: wgpu); Vite (build da lib com três entradas, dev do
app); React 19 no app; SDL2 por FFI na janela do Deno; ffmpeg nos gravadores
**Storage**: N/A (fixtures dos smokes e vídeos em arquivo)
**Testing**: Vitest (1851 testes), smokes de navegador (Chrome headless pelo runner), testes no Deno (`deno test`) para
o núcleo sem DOM e o naga
**Target Platform**: navegadores com WebGPU (Mac, Windows, Linux) e Deno com WebGPU (os três sistemas)
**Project Type**: biblioteca (motor) + app web (clayflow-web)
**Performance Goals**: sem regressão: os mesmos tempos do bench e dos smokes; o Deno não entra nas medidas de
desempenho do motor nesta spec
**Constraints**: os pipelines no teto portátil do navegador nos dois ambientes (R5); quadros iguais antes e depois da
migração (R9); nenhum laço de shader sem orçamento total de passos
**Scale/Scope**: 18 arquivos do núcleo com dependência do navegador (R1); ~16 cenas de vídeo; 308 importações de
shader inalteradas (R3)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Princípio                | Como o plano cumpre                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Camadas e importação  | A superfície fica na C1 (hardware) com o tipo reexportado pela C2; o laço e a entrada na C4; os pontos de entrada em `src/platform/*` são raízes de composição (como o bootstrap do `Application` hoje), compõem pela C2 (`SceneContext`) e não são importados pelo núcleo. A regra de lint ganha `src/platform/**` com as mesmas restrições da C4, mais as globais do navegador e do Deno proibidas fora de `platform` (R2). `madge` sem ciclos. |
| II. Vocabulário na borda | A API de autoria não muda; o web mantém as opções do `Application`; o Deno fala em `target`/`window`.                                                                                                                                                                                                                                                                                                                                             |
| III. Resource            | Nenhum dado de GPU novo fora de `Resource`; a superfície é da C1.                                                                                                                                                                                                                                                                                                                                                                                 |
| IV. ECS e Flows          | Nenhum Flow novo; a ordem dos passes não muda.                                                                                                                                                                                                                                                                                                                                                                                                    |
| V. Testes                | Testes de unidade dos contratos novos (superfícies, relógios, entrada); os smokes de imagem iguais; os testes no Deno passam a rodar WebGPU fora do navegador (amplia o que a constituição dá como impossível em CI).                                                                                                                                                                                                                             |
| VI. Documentação         | Os guias mostram os dois pontos de entrada e o app; JSDoc em todo export novo (`doc:coverage`).                                                                                                                                                                                                                                                                                                                                                   |
| Backend substituível     | Reforçado: a superfície vira contrato da C1.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Release                  | A troca de import (`clayflow` → `clayflow/web` para o `Application`) é mudança de API pública: registrada em `api-pendencias.md` da 034 e no guia de migração.                                                                                                                                                                                                                                                                                    |

Sem violações. Re-check depois do desenho: igual.

## Project Structure

### Documentation (this feature)

```text
specs/038-motor-puro-web/
├── plan.md
├── research.md          # R1–R10
├── data-model.md        # PresentationSurface, FrameClock, InputSource, pontos de entrada, Cena
├── quickstart.md
├── contracts/
│   └── entry-points.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
clayflow/                                  # o motor
├── src/
│   ├── index.ts                           # núcleo (sem Application, sem DOM)
│   ├── core/contracts/PlatformAdapter.ts  # PlatformAdapter + PresentationSurface
│   ├── core/gpu/surfaces/TextureSurface.ts
│   ├── scene/…                            # SceneContext recebe a superfície (tipo pela C2)
│   ├── presentation/
│   │   ├── app/Engine.ts                  # montagem do motor sobre superfície + relógio (o miolo do Application)
│   │   ├── app/FrameClock.ts              # contrato + ManualClock
│   │   └── input/InputSource.ts           # contrato; controladores sobre ele
│   └── platform/
│       ├── web/index.ts                   # WebPlatformAdapter, Application (canvas), AnimationFrameClock, entrada DOM, UI, loaders
│       └── deno/index.ts                  # DenoPlatformAdapter, Application (textura/janela), LoopClock, SDL por FFI, entrada SDL
├── bench/
│   ├── deno/core.test.ts                  # núcleo sem DOM no Deno
│   ├── deno/naga.ts                       # shaders no naga
│   └── page/{main,sampler,smoke}.ts       # ficam (benchmark e smokes)
└── src/__smokes__/                        # ficam, sem videoScenes.ts
    (saem: videoScenes.ts, bench/runner/video.ts, bench/agua.html, bench/page/agua.ts, index.html, src/main.ts)

clayflow-web/                              # o app (o claflow-web renomeado)
├── src/
│   ├── App.tsx                            # catálogo e página da cena (?scene=)
│   ├── scenes/                            # as cenas migradas (uma por arquivo) + o apoio de cena delas
│   └── recorder/page.ts                   # a página do gravador
├── runner/video.ts                        # gravador pelo Chrome (movido do motor)
├── deno/video.ts                          # gravador pelo Deno
└── deno.json                              # task video
```

**Structure Decision**: dois repositórios irmãos em `geom-diff-calc/` (o motor e o app); o app depende do motor por
`file:../clayflow` com alias do Vite às fontes; o Deno usa o `dist/` do motor.

## Fases

1. **Linha de base** (antes de mover nada): gravar duas vezes os 60 primeiros quadros de cada cena de vídeo em FFV1
   pelo motor e guardar a variação por quadro entre as duas (R9); anotar a suíte (testes, smokes que passam, números) como referência de regressão.
2. **Contratos e superfícies (C1/C4)**: `PlatformAdapter` e `PresentationSurface`, a `TextureSurface`, o `WebPlatformAdapter`; `FrameClock`; `InputSource`;
   `Engine` com o miolo do `Application`; testes de unidade. O `Application` web passa a ser composto sobre eles, sem
   mudar comportamento (os smokes iguais).
3. **Pontos de entrada e pacote**: `src/platform/web`, `src/platform/deno`; build com três entradas; pacote `clayflow`
   com `exports` (`.`, `./web`, `./deno`); lint de pureza (R2); os smokes e o bench passam a importar `clayflow/web`.
4. **Deno**: o `Application` do Deno (textura e janela SDL), o teste do núcleo sem DOM, o smoke do naga e as correções
   de WGSL que ele pedir (cada uma conferida pelos smokes de imagem no Chrome).
5. **clayflow-web**: renomear a pasta e o pacote (o repositório no GitHub só com confirmação do usuário), tirar as cenas
   antigas, depender do motor, trazer as cenas e o gravador, o gravador pelo Deno; comparar os hashes com a linha de
   base.
6. **Limpeza do motor**: tirar `videoScenes.ts`, o gravador, as páginas `agua` e `index.html`/`src/main.ts` (esta vira
   smoke se cobrir algo que nenhum smoke cobre — R7); `knip` sem código morto; os guias.

## Riscos

- **Naga mais estrito**: correções de WGSL que mudem o resultado no Chrome — toda correção passa pelos smokes de imagem
  antes de seguir.
- **SDL por FFI**: as assinaturas variam por sistema — só as funções mínimas, testadas no Mac; Windows e Linux pelo
  mesmo código, conferidos quando o usuário rodar na outra máquina.
- **Quadros não determinísticos** (R9): a comparação é contra a variação da linha de base; uma cena migrada abaixo dela
  aponta diferença real (ordem de inserção, tempo real), investigada até a causa.
- **A cena `natureza`**: a luz global dela depende da decisão pendente da 034 (limite de buffers); entra sem a luz global
  até lá.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
