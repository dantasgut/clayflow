# Arquitetura de Solvers de Colisão

```mermaid
flowchart TD
    subgraph "Sequential Impulses (SI) — Implementado"
        SI1["Itera K vezes por substep\n(default: 10 iterações PGS)"]
        SI2["Acumula λ: λ_new = clamp(λ_old + Δλ, 0, ∞)"]
        SI3["Warm Starting: reutiliza λ do frame anterior"]
        SI1 --> SI2 --> SI3
    end
    subgraph "Split Impulse — Alternativa"
        SP1["Separa velocidade e posição"]
        SP2["Corrige penetração sem alterar velocidade\n(evita energia artificial)"]
        SP1 --> SP2
    end
    subgraph "SOR (Successive Over-Relaxation) — Variante"
        SOR1["λ *= ω (fator de relaxação, ex: 1.2-1.5)"]
        SOR2["Converge mais rápido em cenas estáticas\nInstável em cenas dinâmicas"]
        SOR1 --> SOR2
    end
    SI3 -->|"base do engine atual"| Impl(["CollisionResolutionStage"])
```

| Algoritmo | O que resolve | Lógica / Fórmula |
| :--- | :--- | :--- |
| **Sequential Impulses (SI)** | Resolve múltiplas colisões simultâneas de forma iterativa sem matrizes gigantes. | Itera sobre a lista de contatos $N$ vezes. Aplica impulsos locais que convergem para uma solução global estável. |
| **Split Impulse** | Impede que a correção de posição (depenetração) adicione "energia falsa" (velocidade). | Separa o impulso de velocidade ($P_v$) do de posição ($P_p$). A posição é corrigida, mas a velocidade real não herda o "pulo". |
| **Solver Over-Relaxation** | Acelera a convergência do solver, reduzindo o número de iterações necessárias. | Multiplica o impulso por um fator $\omega$ (1.0 a 2.0). $J_{final} = J_{old} + \omega(J_{new} - J_{old})$. |
