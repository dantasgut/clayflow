# Research: Coesão e adesão de fluidos

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Achados no código

Levantamento em `develop` (`a0b3437`):

- **A1 — Material único por cena.** `ParticleMaterial` é um recurso único no World (`ParticleMaterial.of(world)`), lido
  como singleton opcional pelos Flows `SPHFlow`, `PBFFlow` e `MPMFlow`. Todos os corpos de um solver formam um único
  líquido. Por isso, "por material" na spec quer dizer "por cena".
- **A2 — Parâmetros lidos a cada quadro.** Os Flows copiam do material para os parâmetros dos solvers em `framePrepare`,
  uma região de `*SimParams` por iteração (`PerStepUniforms`). O `data` do material é reativo (`Entity.data` com o
  gancho da C2). Mudar um campo em execução já chega ao próximo passo sem recriar nada.
- **A3 — Struct do material.** `ParticleMaterial.schema` tem sete `f32`, mais `_pad0` e dois `vec4f`, total de 64 B.
  Os campos novos entram ocupando `_pad0` e um `vec4f` novo; o struct passa a 80 B. O uniform é só dado do World: os
  kernels leem os `*SimParams`.
- **A4 — SPH.** Os passes são densidade → pressão → forças → integração → colisão, com o XSPH acumulado em `color.xyz`
  e aplicado na integração. Não há espaço livre para a normal de superfície em `SPHParticle`, porque `force` e `color`
  são reescritos pelo passe de forças enquanto os vizinhos são lidos. A normal precisa de um buffer próprio.
- **A5 — PBF.** Os passes são predição → (λ → correção → aplicação → colisão) × N → velocidade → vorticidade → XSPH
  (escreve `pbf_delta`) → aplicação da velocidade. A densidade não é guardada: `pos.w` guarda λ. Em `curl`, só o `w`
  está livre. O passe de vorticidade já percorre os vizinhos depois da atualização de velocidade.
- **A6 — Fronteiras.** As fronteiras são de dois tipos:
  - **Domínio:** `sph_collision`/`pbf_collision` tratam só os planos de `bound_min` (piso e dois lados).
  - **Colliders:** passam por `collider_set_push_out` (plano, caixa, esfera), em `math/collider_set.wgsl`. Esse
    arquivo já define `ColliderHit { dist, normal }` (distância com sinal e normal de mundo), que é a descrição genérica
    de fronteira pedida em FR-008.
  - **Malhas:** os colliders de malha não geram contato (P2).
- **A7 — MPM.** `mpm_p2g.wgsl` monta a tensão de Kirchhoff do fluido como `K J (J − 1) I`. A matriz afim `C` do APIC
  aproxima ∇v. `mpm_params.viscosity` é escrito, mas não é lido.
- **A8 — Passo estável.** Ele é derivado do material (`sphStableDt`, `pbfStableDt`, `mpmStableDt`) e vira substeps em
  `ParticleMaterial.substepsFor`, sem teto.
- **A9 — Fixtures do MPM fluido afetadas pela viscosidade (FR-012).** Com a viscosidade padrão 0,01, mudam:
  - `particles-mpm-fluid`;
  - `fluidSurface-mpm`;
  - a parte MPM fluido de `trajectories-apple-metal-3.bin`, se existir (a verificar em T001).

## Decisões

### R1 — Modelo de tensão superficial: Akinci, Akinci e Teschner 2013

A força entre i e j é a coesão mais a curvatura, multiplicadas pelo fator de correção K_ij = 2ρ₀/(ρᵢ+ρⱼ):

- **Coesão:** `F_coh = −γ mᵢ mⱼ C(r) r̂`. C é a spline de Akinci, com suporte `H`: atração no meio do alcance e
  repulsão a curta distância.
- **Curvatura:** `F_curv = −γ mᵢ (nᵢ − nⱼ)`, com a normal `nᵢ = H Σⱼ (mⱼ/ρⱼ) ∇W(rᵢⱼ)`.
- **Suporte `H`:** é o da vizinhança de cada solver, 2h no SPH e h no PBF.

**Por quê:** é o modelo pedido pelo usuário. Também é local, usa só a lista de vizinhos que já existe, e o termo de
curvatura reduz a área sem aglomerar partículas. A correção K_ij evita a borda densa.

**Alternativas rejeitadas:**

- **CSF (Brackbill):** precisa de curvatura por divergência da normal, que é ruidosa com poucas partículas.
- **Becker e Teschner 2007:** tem só coesão e aglomera partículas na borda.

### R2 — Escala do parâmetro `cohesion`

O parâmetro do material é adimensional: `γ = cohesion · g₀ / (ρ₀ · Ĉ)`, com g₀ = 9,81 m/s². Ĉ normaliza a soma de
C(r) sobre a vizinhança em repouso (constante calculada em `ParticleMaterial`). Com `cohesion = 1`, a aceleração de
coesão de uma partícula de borda tem a ordem de g, o que equivale a um número de Bond ≈ 1 na escala do kernel.

O valor de referência "água" para as cenas de 2–5 cm é calibrado pelo smoke (SC-001: gota arredondada em 3 s sem
explodir) e documentado como constante pública (`ParticleMaterial.WATER_COHESION`). Esse valor não é a tensão
física de 0,072 N/m: nessa escala, ela seria invisível.

### R3 — Adesão: integral de meio-espaço do núcleo de Akinci sobre a fronteira genérica

Akinci 2013 define a adesão sobre partículas de fronteira: `F_adh = −β mᵢ Ψ_b A(r) r̂`, com A não nula em (H/2, H].
Aqui a fronteira é uma superfície com distância e normal (`ColliderHit`), e não um conjunto de partículas. A força é
então a integral de A sobre o meio-espaço sólido à distância d, com densidade ρ₀ no lugar de Ψ_b.

Por simetria, sobra só a componente normal:

`F_n(d) = β mᵢ ρ₀ π ∫_{max(d, H/2)}^{H} A(r) (r² − d²) dr`

Ela é avaliada por Gauss-Legendre de 8 pontos em WGSL, e só quando 0 ≤ d < H. Fora dessa faixa não há custo. A
fronteira é tratada como localmente plana, o que vale na escala de H. É o mesmo tratamento das funções de distância
(SDF) da 015/016.

- **Componente tangencial (FR-009):** um arrasto `−β_t (v − v_b)_t` dentro da mesma faixa, com β_t proporcional a β e
  peso pela mesma integral normalizada. Usa-se `v_b = 0` (colliders sem velocidade exposta, como hoje).
- **Escala:** `β = adhesion · g₀ / (ρ₀ · Â)`, com Â normalizando F_n(H/2). Com `adhesion = 1`, a aceleração de
  adesão no contato tem a ordem de g.
- **Fronteiras cobertas:** os planos do domínio (`bound_min`) e os colliders do conjunto (plano, caixa, esfera).

**Alternativa rejeitada:** amostrar partículas de fronteira (Akinci 2012) para cada collider. É custoso, depende da
geometria e duplicaria o trabalho da 015/016, que vai trazer fronteiras por SDF.

### R4 — Onde cada termo roda

**SPH:**

- Passe novo `sph_normals`, entre a densidade e a pressão. Ele escreve `nᵢ` num buffer privado do Flow, `sph_normal`
  (vec4f por partícula, `NEIGHBOR_SEARCH_MAX_PARTICLES` entradas).
- `sph_forces` soma coesão e curvatura quando `cohesion_gamma > 0`.
- A adesão entra em `sph_collision`, que já tem o grupo de colliders e o domínio: `vel += dt · a_adh` antes do
  empurrão para fora.

**PBF:**

- `pbf_vorticity` passa a calcular também ρᵢ, guardado em `curl.w`, e `nᵢ`, guardado no buffer privado `pbf_normal`.
- `pbf_xsph` soma `dt · (a_coh + a_curv)` ao Δv.
- A adesão entra em `pbf_predict`, junto da gravidade. O passe ganha o grupo de colliders e roda uma vez por iteração;
  a colisão roda N vezes por iteração, por isso a adesão não pode ficar nela.

**Comum:** as funções de adesão (`collider_set_adhesion`) e os núcleos C e A ficam definidos uma vez, em
`math/collider_set.wgsl` e `math/sph_kernels`. O teste de símbolo único garante isso.

### R5 — Identidade bit a bit com zero (FR-005, FR-010)

- **Coesão = 0:** o Flow não grava o passe de normais. Os kernels testam `cohesion_gamma > 0` e
  `adhesion_beta > 0` antes de qualquer conta, e sem o termo nada é somado. A ordem das somas já existentes não muda.
- **XSPH padrão 0,05:** é igual ao atual.
- **Verificação:** fixtures existentes passam sem regravar (exceto o MPM fluido, R7).

### R6 — Estabilidade (FR-015)

O passo capilar `dt_σ = √(ρ₀ s³ / (2π σ_eff))`, com σ*eff derivado de γ (Brackbill), entra em `sphStableDt` e
`pbfStableDt` como `min(CFL, dt*σ)`. Só vale com coesão > 0. Com coesão = 0, o passo continua exatamente o de hoje.

Se o passo capilar exigir mais de 4× os substeps base, a coesão efetiva é grampeada ao valor que cabe em 4× e o Flow
avisa uma vez por material. Para isso, `ParticleMaterial.effectiveCohesion(stepDt)` devolve o valor e se houve
grampeamento. A adesão segue a mesma regra, com `dt_β` pela aceleração máxima de contato.

### R7 — Viscosidade do MPM fluido (FR-012)

A tensão de Kirchhoff do fluido ganha o termo viscoso newtoniano:

`τ += J · μ · (C + Cᵀ)`

C é a matriz afim do APIC, que aproxima ∇v. Esse é o mesmo tratamento do MLS-MPM (Hu et al. 2018) para fluidos.

- **Estabilidade:** o passo estável do MPM ganha a restrição viscosa `dt_μ = dx² ρ₀ / (6 μ)`.
- **Fixtures:** as listadas em A9 são regravadas e vão para aprovação no PR.

### R8 — Material

Campos novos em `ParticleMaterial`:

- `cohesion` (padrão 0), no lugar de `_pad0`;
- `adhesion` (padrão 0), `xsph` (padrão 0,05) e dois preenchimentos, escalares no fim do struct (depois de `domainMax`), para `material.data.adhesion` funcionar como os demais campos.

A validação segue as funções `positive`/não negativa já existentes.

Os Flows copiam para os `*SimParams` os valores derivados, já em unidades do solver e grampeados por R6:

- `cohesion_gamma`;
- `adhesion_beta`;
- `adhesion_tangential`;
- `xsph_c`.

### R9 — Smoke `fluidBehavior` (FR-020)

Cenas pequenas, de 1–4k partículas, com leitura de volta só no smoke, para medir. Cada caso guarda a medida numérica e
uma fixture de imagem.

| Caso                                          | Medida                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Gota em g = 0 (SPH e PBF, coesão de água × 0) | Razão de semieixos pela matriz de covariância das posições                     |
| Filete caindo                                 | Componentes conexos por raio de vizinhança antes do fundo                      |
| Barragem                                      | Partículas sem vizinhas na borda; energia cinética não crescente após assentar |
| Tanque em repouso                             | Altura média da coluna a ≤ 2s da parede × centro (adesão alta × zero)          |
| Placa inclinada (caixa rotacionada)           | Tempo de percurso e partículas que ficam a ≤ H da placa                        |
| Gota na placa horizontal                      | Área de contato para adesão 0; 0,5; 1                                          |
| MPM fluido                                    | Frente da onda em 2 s para μ baixo × alto                                      |
| Troca em execução                             | Coesão de 0 → água no quadro N; forma muda a partir de N+1                     |
| 30/60/144 Hz                                  | Trajetória igual (reaproveita o arranjo do smoke `trajectories`)               |

### R10 — Bench

- A cena `particles` ganha `4k-cohesion` e `64k-cohesion`: SPH com coesão e adesão de referência, desenhado em
  sprites, para isolar o custo da simulação.
- SC-009 é medido como GPU de `64k-cohesion` ≤ 1,25 × `64k`.
- O baseline é regravado ao fim.

### R11 — Vídeos (FR-024)

Página temporária de gravação no scratchpad, nos moldes da 017, com cinco clipes:

- gota se arredondando;
- filete se partindo;
- menisco;
- placa inclinada;
- barragem com a água da 017, com coesão e adesão de referência × sem elas, lado a lado.

Os clipes são juntados num mp4 de até 30 MiB.
