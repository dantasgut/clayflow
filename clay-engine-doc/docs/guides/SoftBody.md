As principais abordagens para SoftBody:

  ---
  1. Spring-Mass (Massa-Mola)

  O que o stub atual sugere. Cada aresta da malha é uma mola: F = k·(|Δp| - restLength) · n̂. Integração explícita (Euler/Verlet).

  Prós: simples, intuitivo, GPU-friendly (paralelo por partícula).
  Contras: instável para k alto (rigidez exige dt pequeno), não conserva volume, parâmetros físicos sem significado real (k ≠ módulo de Young).

  ---
  2. XPBD Particles

  O que descrevi antes. Constraints de distância resolvidas por projeção iterativa com compliance α.

  Prós: incondicionalmente estável, α mapeia diretamente para rigidez física, reaproveita toda a infraestrutura XPBD já implementada.
  Contras: convergência lenta para alta rigidez sem muitos substeps.

```mermaid
flowchart TD
    Pred["1. Predict\npos_pred = pos + vel * dt + a * dt²"]
    Solve["2. Solve Constraints\nPara cada aresta (i,j):\nΔx = (|pi-pj| - L₀) / (wi+wj)\nλ += Δλ (com alphaTilde)"]
    Vel["3. Derive Velocity\nvel = (pos_pred - pos) / dt\nvel *= dampFactor"]
    Commit["4. Commit Position\npos = pos_pred"]
    Sync["5. Sync\nTransform.position = pos"]

    Pred --> Solve --> Vel --> Commit --> Sync
    Solve -->|"itera N vezes\npor substep"| Solve

    style Pred fill:#4ecdc4
    style Sync fill:#ffe66d
```

  ---
  3. FEM (Finite Element Method)

  Divide o corpo em tetraedros; calcula stress/strain por elemento usando tensor de deformação. Base da simulação industrial (Abaqus, FEniCS).

  Prós: fisicamente correto, parâmetros são módulo de Young + coeficiente de Poisson.
  Contras: complexo, requer malha volumétrica (não apenas superfície), custo alto.

  ---
  4. Shape Matching

  Não usa constraints por aresta — computa a transformação rígida "mais próxima" do estado deformado e puxa partículas de volta a ela.

  Prós: extremamente estável e rápido, sem parâmetros de constraint por aresta.
  Contras: não é fisicamente correto, deformação é visual não mecânica.

  ---
  5. MPM (Material Point Method)

  Híbrido partícula-grade: partículas carregam momentum, grade resolve forças, partículas atualizam posição. Usado em neve (Frozen), água, areia.

  Prós: lida com grandes deformações, fratura, fluidos e granulares com o mesmo framework.
  Contras: custo alto de memória (grade 3D), implementação complexa.

  ---
  Qual faz sentido aqui

  Dado que o engine já tem XPBD funcionando:

```mermaid
flowchart LR
    subgraph "Spring-Mass"
        SM_Int["Integração: Baixa\n(solver separado)"]
        SM_Custo["Custo: Baixo"]
        SM_Qual["Qualidade: Fraca\n(instabilidade numérica)"]
    end
    subgraph "XPBD Particles ✅ Implementado"
        XP_Int["Integração: Alta\n(reaproveita pipeline)"]
        XP_Custo["Custo: Médio"]
        XP_Qual["Qualidade: Boa\n(compliance físico)"]
    end
    subgraph "Shape Matching"
        SH_Int["Integração: Média"]
        SH_Custo["Custo: Médio"]
        SH_Qual["Qualidade: Visual\n(não conserva energia)"]
    end
    subgraph "FEM"
        FEM_Int["Integração: Nenhuma\n(pipeline separado)"]
        FEM_Custo["Custo: Alto"]
        FEM_Qual["Qualidade: Excelente\n(fisicamente correto)"]
    end
    subgraph "MPM"
        MPM_Int["Integração: Nenhuma"]
        MPM_Custo["Custo: Muito alto\n(grade 3D esparsa)"]
        MPM_Qual["Qualidade: Excelente\n(fluidos, areia, neve)"]
    end
```
