# Métodos de Simulação de Partículas

Comparativo técnico de métodos de simulação baseados em partículas relevantes para a engine, com foco em viabilidade de implementação GPU e roadmap de integração.

---

## Tabela Comparativa

| Método | Tipo | Fenômenos alvo | Paralelismo GPU | Complexidade por partícula | Conservação de massa | Pressão compressível | Malha auxiliar |
|--------|------|---------------|----------------|---------------------------|---------------------|---------------------|----------------|
| **FLIP / APIC** | Híbrido partícula-grade | Fluidos incompressíveis, superfícies livres | Alta — kernels P2G/G2P, pressure Jacobi | O(k³) por partícula (stencil) | Boa (com APIC) | Não (proj. divergência-zero) | Grid Euleriano |
| **SPH** | Lagrangiano puro | Fluidos, superfícies livres, corpos moles | Média — neighbor search com hash | O(k) por partícula | Boa | Sim (weakly compressible) | Nenhuma |
| **PBD** | Baseado em posição | Tecidos, cordas, soft bodies, ragdoll | Alta — solver Gauss-Seidel / Jacobi | O(k) por constraint | Aproximada | Não | Nenhuma |
| **PBF** | Baseado em posição (fluido) | Fluidos incompressíveis interativos | Alta — densidade Jacobi por iteração | O(k) por partícula | Boa (iterativa) | Não | Nenhuma |
| **MPS** | Semi-implícito (Lagrangiano) | Sloshing, impacto livre, fluidos viscosos | Baixa — sistema linear global | O(k²) por partícula | Excelente | Não | Nenhuma |
| **LBM** | Grade de Boltzmann | Fluxo incompressível, aerdinâmica | Muito alta — totalmente local | O(1) por célula | Exata | Sim (pseudo) | Grid fixo |

---

## FLIP / APIC — Fluid-Implicit-Particle / Affine Particle-in-Cell

**Princípio:** Partículas transportam quantidade de movimento; a grade Euleriana resolve a pressão (projeção incompressível). APIC estende FLIP com transferência afim: cada partícula carrega um mini-tensor de velocidade local, eliminando o ruído típico do FLIP puro.

**Pipeline típico:**
1. **P2G** — acumular massa + momentum das partículas na grade
2. **Grid update** — adicionar forças, aplicar condições de contorno
3. **Pressure solve** — resolver ∇·u = 0 (Jacobi ou Multigrid)
4. **G2P** — interpolar velocidades de volta para as partículas (FLIP: blend PIC/FLIP; APIC: reconstrução afim)
5. **Advect** — mover partículas com RK2

**Prós:**
- Superfícies livres naturais (rastreio de nível implícito)
- APIC elimina dissipação numérica excessiva
- Sem instabilidade numérica por time step moderado

**Contras:**
- Pressure solve global (PCG/Jacobi) é gargalo GPU
- Precisa de grid Euleriano (overhead de memória)
- Reconstrução de superfície (Marching Cubes) custosa

**Relevância para o engine:** Método preferido para simulação de água e fluidos realistas. Pressure solve com Jacobi iterativo é viável em WebGPU (já temos precedente no MPM). MPM atual pode ser visto como progenitor — adaptar P2G/G2P existente para campo de pressão divergência-zero.

---

## SPH — Smoothed Particle Hydrodynamics

**Princípio:** Cada partícula representa um volume de fluido; propriedades são estimadas por interpolação ponderada por kernel W(r,h) sobre os vizinhos dentro do raio de suavização h.

**Equações chave:**
- Densidade: ρᵢ = Σⱼ mⱼ W(rᵢⱼ, h)
- Pressão (EOS): p = k(ρ − ρ₀) (weakly compressible)
- Aceleração: aᵢ = −Σⱼ mⱼ (pᵢ/ρᵢ² + pⱼ/ρⱼ²) ∇W

**Prós:**
- Puramente Lagrangiano — sem grade, sem alocação dinâmica
- Superfícies livres triviais
- Simples de implementar; cada partícula independente (após neighbor search)

**Contras:**
- Neighbor search: hash grid (O(N log N) build, O(k) query) — custo dominante
- Compressibilidade espúria: ondas de pressão artificiais
- Time step restrito por CFL

**Relevância para o engine:** Ideal para fluidos de baixo custo (< 100k partículas), spray, respingos. Neighbor hash GPU é infraestrutura reutilizável por SPH, DFSPH e PBF.

---

## PBD — Position Based Dynamics

**Princípio:** Em vez de integrar forças, as posições são corrigidas diretamente para satisfazer constraints geométricas (distância, volume, ângulo). Extended PBD (XPBD) introduz compliance α para controle independente de rigidez/time step.

**Já presente na engine** como `SoftBodyXPBDComputePass` (tecido, soft bodies). O XPBD aqui é PBD com compliance.

**Prós:**
- Incondicionalmente estável
- Controle intuitivo de rigidez por compliance
- Alta paralelizabilidade (graph coloring ou Jacobi)

**Contras:**
- Não conserva quantidade de movimento exatamente
- Rigidez real depende de substeps (não apenas α)
- Fluidos com PBD puro convergem lentamente

**Relevância para o engine:** Já implementado. Graph coloring GPU é a otimização pendente (ver `project_graph_coloring_plan.md`).

---

## PBF — Position Based Fluids

**Princípio:** Aplica PBD a fluidos: constraint de incompressibilidade Cᵢ = ρᵢ/ρ₀ − 1 = 0. Cada iteração corrige posições para atingir densidade alvo, com tensão superficial via vorticity confinement e viscosidade XSPH.

**Prós:**
- Mesmo pipeline que PBD — reutiliza solver
- Interativo (real-time com 10k–100k partículas)
- Fácil de mesclar com tecidos e rigid bodies (mesmo framework)

**Contras:**
- Neighbor search necessário (mesma infraestrutura SPH)
- Compressibilidade residual (iterações limitadas)
- Sem conservação rigorosa de momento

**Relevância para o engine:** Alta — neighbor hash GPU serve para SPH e PBF. Pode reutilizar o solver XPBD com constraint de densidade.

---

## MPS — Moving Particle Semi-Implicit

**Princípio:** Método Lagrangiano com pressão implícita — resolve sistema linear ∇²p = f por PPE (Particle Pressure Equation). Desenvolvido para engenharia naval (sloshing, impacto de ondas).

**Prós:**
- Pressão implícita → time steps maiores que SPH explícito
- Excelente conservação de massa e incompressibilidade

**Contras:**
- Sistema linear global — difícil de paralelizar em GPU (requer solver esparso: CG, AMG)
- Complexidade de implementação alta
- Menos comum em tempo real

**Relevância para o engine:** Baixa para tempo real. Solver esparso global (CSR + CG GPU) seria infraestrutura reutilizável, mas custo de desenvolvimento é alto. Não recomendado como próximo passo.

---

## LBM — Lattice Boltzmann Method

**Princípio:** Discretiza a equação de Boltzmann em uma grade cartesiana com velocidades discretas (modelo D3Q19 ou D3Q27). Evolução = streaming + colisão local — completamente local, sem resolver sistemas lineares.

**Pipeline:**
1. **Collision** — relaxação para equilíbrio Maxwelliano (BGK)
2. **Streaming** — propagar distribuições para células vizinhas
3. Extração de ρ, u das distribuições (macroscópico)

**Prós:**
- Trivialmente paralelizável — zero dependência global
- Excelente para fluxo incompressível em geometrias complexas
- Implementação GPU extremamente eficiente (tudo local)

**Contras:**
- Grid fixo — difícil capturar superfícies livres
- Compressibilidade artificial limitante (Ma << 1)
- Alta memória: D3Q27 = 27 floats por célula
- Coupling com partículas não trivial

**Relevância para o engine:** Ideal para fumaça, aerdinâmica, vento — fluidos sem superfície livre visível. Integração com renderer por velocidade de grade → campo de partículas advectadas (GPU particle system). Prioridade média.

---

## Resumo de Prioridades para Roadmap

| Método | Prioridade | Justificativa | Infraestrutura reutilizável |
|--------|-----------|--------------|----------------------------|
| **PBF** | Alta | Reutiliza solver XPBD + neighbor hash | SoftBodyXPBDComputePass, XPBD constraints |
| **SPH (WCSPH)** | Alta | Neighbor hash serve PBF e SPH | Hash grid GPU |
| **FLIP/APIC** | Média | Água realista; P2G/G2P já existe no MPM | MPMComputePass (P2G, G2P, grid) |
| **LBM** | Média | Fumaça/vento; totalmente local | PointCloudGeometry, GPUParticleEmitter |
| **MPS** | Baixa | Solver esparso global; custo alto | — |

---

## Relação com o Pipeline Atual

```
PhysicsComputePass (interface)
├── LCPComputePass        — RigidBody
├── SoftBodyXPBDComputePass — PBD/XPBD (tecido, soft bodies)
├── FEMComputePass        — FEM (gelatina, elásticos)
├── MPMComputePass        — MPM (neve, areia, argila)  ← atual
│
│   [Roadmap de partículas]
├── SPHComputePass        — fluidos lagrangianos
├── PBFComputePass        — fluidos interativos (reutiliza XPBD)
├── FLIPComputePass       — água com superfície livre
└── LBMComputePass        — fumaça / aerdinâmica
```

Todos registrados no `GpuComputePassRegistry` via `createGpuPhysicsWorld`, seguindo o padrão estabelecido.
