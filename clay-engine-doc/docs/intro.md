---
sidebar_position: 0
title: Visão Geral
slug: /intro
---

# Clay Engine

Motor 3D **WebGPU** em TypeScript — física na GPU (XPBD, LCP, FEM, MPM, SPH/PBF), rendering PBR com sombras,
pós-processamento modular e partículas. Arquitetura *clean* em quatro camadas com superfície pública mínima.

## Por onde começar

| Quero… | Vá para |
| :--- | :--- |
| **Rodar um app em 3 passos** | [Getting Started](./guides/getting_started.md) |
| **Entender os fundamentos** (espaços, matrizes, integração) | [Conceitos — CG, Matemática e Física](./guides/conceitos_cg_matematica_fisica.md) |
| **Entender a arquitetura** (camadas C1–C4, ECS, `Resource`/`Flow`) | [Arquitetura do Motor](./guides/architecture_resource_loaders.md) |
| **Adicionar física** | [Physics Flows](./guides/physics_flows.md) |
| **Estudar WebGPU do zero** | [Fundamentos e Inicialização](./guides/01_Fundamentos_e_Inicializacao.md) → guias 01–10 |
| **Consultar a API** | [API Reference](./api/README.md) |
| **Migrar de uma versão legada** | [Migração legacy → clean](./guides/migration_legacy_to_clean.md) |

## As quatro camadas

- **C1 — Hardware** (`src/core`): `EngineCore`, facade mínima sobre WebGPU (recursos via `ResourceSpec`).
- **C2 — Sincronização/ECS** (`src/scene`): `World`, `ResourceSystem`/`ExecutionSystem`, `Flow`, descritores
  (`Schema`/`GPUDescriptor`), `EventBus`.
- **C3 — Elementos** (`src/elements`): geometrias, materiais, bodies, colliders, constraints, force fields, flows.
- **C4 — Apresentação** (`src/presentation`): `Application`, controllers, pós-processamento, loaders, UI.

> Regra de importação: C3/C4 dependem apenas dos **contratos** públicos; nunca da implementação WebGPU
> (`core/gpu`). Detalhes em [Arquitetura do Motor](./guides/architecture_resource_loaders.md).
