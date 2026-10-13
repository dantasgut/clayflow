<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Bump rationale: MINOR — o Princípio I passa a exigir a fronteira de importação da decisão D4 (spec 006): C3/C4
  deixam de importar `core/contracts`/`core/interfaces` e recebem os tipos da C1 pelos reexports da C2
  (`scene/contracts/gpu`); a regra passa a ser verificada no lint. Expansão material da orientação, sem remover
  princípio.
- Modified principles:
    I. Arquitetura em Camadas e Regra de Importação — lista de imports permitidos a C3/C4 trocada; verificação no
       lint (`@typescript-eslint/no-restricted-imports` em `src/elements/**` e `src/presentation/**`).
- Added sections: nenhuma. Removed sections: nenhuma.
- Templates status:
    ✅ .specify/templates/plan-template.md — "Constitution Check" já cita os Princípios I–VI; sem mudança
    ✅ .specify/templates/spec-template.md — sem mudança
    ✅ .specify/templates/tasks-template.md — sem mudança
    ✅ CLAUDE.md — menção de versão atualizada para 1.1.0
    ✅ eslint.config.js — regra da fronteira (T059 da spec 006)
- Deferred / needs ratification:
    RATIFICATION(1.1.0): esta emenda é ratificada pelo mantenedor no PR da spec 006.
    TODO(TESTING_C3_C4): nível de obrigatoriedade dos testes para C3/C4 (ver Princípio V).
    TODO(VERSIONING): política de versionamento/release e changelog (ver Restrições Técnicas e de Release).
    TODO(RATIFICATION_DATE): confirmar 2026-06-09 como data de adoção.
-->

# Clay Engine Constitution

Clay Engine é um motor 3D WebGPU em TypeScript com arquitetura limpa em quatro camadas
(C1 Hardware, C2 Sincronização/ECS, C3 Elementos, C4 Apresentação). Esta constituição define os
princípios não-negociáveis que governam o código, a API pública e o processo de desenvolvimento.

## Core Principles

### I. Arquitetura em Camadas e Regra de Importação

As quatro camadas têm fronteiras estritas e direção de dependência única (de cima para baixo):

- **C1 Hardware** (`src/core`) — `EngineCore` como facade mínima sobre WebGPU; recursos identificados por
  `ResourceSpec` (spec-as-identity); encoders/passes/recursos GPU NUNCA escapam como objetos navegáveis.
- **C2 Sincronização/ECS** (`src/scene`) — `World`, `ResourceSystem`/`ExecutionSystem`, `Flow`, descritores
  (`Schema`/`GPUDescriptor`/`PipelineDescriptor`), `EventBus`.
- **C3 Elementos** (`src/elements`) e **C4 Apresentação** (`src/presentation`).

Regra MUST: C3 e C4 importam **apenas** a C2 — os contratos públicos (`scene/contracts`, `scene/descriptors`,
`scene/world`, `scene/events`, `scene/flows`, `scene/shaders`, `scene/consumers`, `scene/time`) e, para os tipos de
GPU da C1, os reexports de tipos de `scene/contracts/gpu` (nenhum valor da C1 atravessa). É PROIBIDO importar
`core/` (contratos, interfaces ou a implementação WebGPU) fora de C1 e C2; a regra é verificada no lint
(`no-restricted-imports` em `src/elements/**` e `src/presentation/**`, testes inclusive). O bootstrap da C4
(`Application`) compõe a cena pelo `SceneContext` e pelos tipos dos sistemas da C2. Dependências circulares são
proibidas (validadas em CI por `madge`).

**Rationale**: a fronteira tipada mantém o backend WebGPU substituível e impede o vazamento de hardware
para o domínio. Com a C2 como única porta, uma troca na C1 se resolve nos reexports da C2 sem tocar C3/C4. Sem
ela, "clean architecture" vira decoração.

### II. Vocabulário de Domínio na Borda, Data-Oriented no Núcleo

A API pública DEVE falar no vocabulário do domínio (massa, atrito, restituição, raio, halfExtents, cor,
rugosidade). O layout de buffer (`vec4`, `invMass` no `w`, `schema`, `pool key`) é detalhe interno e NÃO
DEVE aparecer na superfície de autoria. Toda família de elementos (geometria, material, física, partículas)
DEVE oferecer uma **fachada de autoria** sobre o núcleo de `Schema`/descriptor — núcleo data-oriented por
dentro, vocabulário de domínio por fora. As duas coisas são camadas distintas, não concorrentes.

**Rationale**: é o que separa a renderização (amigável) da física (hoje crua) — ver `specs/001-…`. A
ergonomia da borda é requisito, não acidente. Núcleo data-oriented existe para o engine, não para o usuário.

### III. Resource como Contrato Único de Dado GPU

Todo dado que vai à GPU DEVE implementar o contrato `Resource`
(`getDescriptors()`/`getPipelineDescriptors()`/`pack()`). Alocação, atualização e descarte ocorrem
exclusivamente via `ResourceSystem`; nenhum elemento de C3/C4 acessa C1 diretamente. Dados (`dt`,
parâmetros de simulação, uniforms, render targets) DEVEM ser declarados via descriptor com `Schema`,
nunca passados como parâmetro solto de método.

**Rationale**: um único contrato torna qualquer recurso alocável, catalogável e coalescível de forma
uniforme, e mantém C1 como a única fronteira com o hardware.

### IV. ECS Data-Oriented e Flows

O estado vive no `World` (ECS: `EntityId` + componentes), coalescido em pools — em data classes puras, não
em grafos de objetos por instância. A simulação é expressa como `Flow` (LCP, XPBD, FEM, MPM, SPH, PBF),
roteado pelo `schema`/pool key do corpo. Novos algoritmos entram como novos `Flow`/`Schema`, sem ramificar
o núcleo (OCP). A ordenação entre passes/flows DEVE ser explícita por dependência declarada, não implícita
pela ordem de registro.

**Rationale**: DoD habilita o batch massivo na GPU; o roteamento por schema mantém o core agnóstico aos
solvers concretos. Ordenação implícita é fonte conhecida de bugs (ver guia de Colisões).

### V. Disciplina de Testes e Verificação

Toda lógica determinística CPU-side (tradução domínio→`data`, `pack`/layout, graph coloring, math/quaternion,
roteamento de flow, ciclo de vida de recursos) DEVE ter teste de unidade. A verdade da simulação GPU é
validada por smokes de browser (compute round-trip, queda livre, demo C1–C4), já que WebGPU headless não
roda em CI. É PROIBIDO marcar trabalho como concluído com testes falhando ou implementação parcial.
TODO(TESTING_C3_C4): ratificar o nível de obrigatoriedade para C3/C4 — hoje 0 testes automatizados nessas
camadas (só smokes manuais); a meta proposta é cobertura CPU-side determinística obrigatória para nova
lógica de C3/C4.

**Rationale**: a fundação (C1/C2) já é testada; a amplitude da física (C3) e da apresentação (C4) é o maior
risco de regressão não coberto. Testar a parte CPU-side é o investimento de maior retorno em maturidade.

### VI. Documentação como Fonte Única e Coesa

A documentação tem fonte única (site Docusaurus em `clay-engine-doc`). A referência de API é gerada do
JSDoc por um único gerador TypeDoc (sem geradores duplicados). Todo export público DEVE ter JSDoc
(verificado em CI por `doc:coverage`). O build de docs roda com `onBrokenLinks: 'throw'` — links quebrados
reprovam. A documentação de autoria DEVE usar vocabulário de domínio (coerente com o Princípio II); conteúdo
legado vive em guia de migração, nunca apresentado como corrente.

**Rationale**: documentação divergente do código é pior que ausência. Fonte única + gates evitam a deriva.

## Restrições Técnicas e de Release

- **Stack**: TypeScript estrito + WebGPU. Sem fallback CPU para simulação. `gl-matrix`/`uuid` como deps de
  runtime mínimas.
- **Backend substituível**: a implementação fica em `core/gpu`; um backend alternativo (`webgl`, `mock`)
  DEVE ser possível sem tocar C2/C3/C4.
- **Superfície pública**: exportada pelos barrels; a API de autoria não expõe tipos internos de layout.
- **Versionamento/Release**: TODO(VERSIONING) — ratificar SemVer + CHANGELOG + política de publicação.
  Estado atual: `0.1.0`, sem changelog. Mudanças incompatíveis na API pública DEVEM ser MAJOR quando
  a política for ratificada.

## Fluxo de Desenvolvimento e Quality Gates

- **Base**: o fluxo parte sempre de `develop`; trabalho em branches de feature; merge via PR.
- **CI obrigatório (gate de PR)**, nesta ordem de feedback rápido: lint → format check → dependências
  circulares (`madge`) → dead code (`knip`) → type-check (`tsc --noEmit`) → testes + coverage →
  doc-coverage (JSDoc em exports públicos) → build da lib. Um PR não funde com qualquer gate vermelho.
- **Spec Kit**: mudanças significativas seguem o fluxo `constitution → specify → plan → tasks → implement`.
  Specs e planos verificam conformidade com esta constituição ("Constitution Check").
- **Hooks**: o repositório usa hooks de commit do Spec Kit (`.specify/extensions.yml`); commits são do
  usuário (não automáticos sem confirmação).

## Governança

Esta constituição supersede outras práticas em caso de conflito. Emendas DEVEM ser documentadas (o que muda
e por quê), versionadas e revisadas em PR. O versionamento desta constituição segue SemVer:

- **MAJOR**: remoção/redefinição incompatível de princípio ou governança.
- **MINOR**: novo princípio/seção ou expansão material de orientação.
- **PATCH**: clarificações e ajustes não-semânticos.

Toda revisão de PR DEVE verificar conformidade com os Princípios I–VI; complexidade adicional DEVE ser
justificada. Itens marcados `TODO(...)` exigem ratificação explícita do mantenedor antes de virarem regra
plenamente exigível.

**Version**: 1.1.0 | **Ratified**: 2026-06-09 | **Last Amended**: 2026-10-12
