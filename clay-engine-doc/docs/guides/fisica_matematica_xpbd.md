# Fundamentos Matemáticos — Física GPU

Toda a matemática implementada nos kernels WGSL do Clay Engine, organizada da base para os pipelines.

---

## Parte I — Fundamentos

Primitivas reutilizadas por todos os pipelines. Cada seção corresponde a um módulo WGSL independente.

---

### 1. Quaternions (`quat.wgsl`)

Formato XYZW, consistente com gl-matrix. Todas as operações a seguir são funções puras — sem efeitos colaterais nem structs externos.

#### 1.1 Produto quaternion

$$
\mathbf{a} \otimes \mathbf{b} = \begin{pmatrix}
a_w b_x + a_x b_w + a_y b_z - a_z b_y \\
a_w b_y - a_x b_z + a_y b_w + a_z b_x \\
a_w b_z + a_x b_y - a_y b_x + a_z b_w \\
a_w b_w - a_x b_x - a_y b_y - a_z b_z
\end{pmatrix}
$$

#### 1.2 Rotação de vetor

$$
\mathbf{v}' = \mathbf{q} \otimes [\mathbf{v}, 0] \otimes \mathbf{q}^{-1}
$$

Forma expandida (sem quaternion extra):

$$
\mathbf{t} = 2\,(\mathbf{q}_{xyz} \times \mathbf{v}), \qquad \mathbf{v}' = \mathbf{v} + q_w \mathbf{t} + \mathbf{q}_{xyz} \times \mathbf{t}
$$

Para rotação inversa (world → local): sinal de `q_w` invertido.

#### 1.3 Integração de orientação

Derivada da orientação:

$$
\dot{\mathbf{q}} = \tfrac{1}{2}\,\boldsymbol{\omega} \otimes \mathbf{q}
$$

Aproximação Euler semi-implícito de primeira ordem:

$$
\tilde{\mathbf{q}} = \text{normalize}\!\left(\mathbf{q} + \tfrac{\Delta t}{2} \cdot [\boldsymbol{\omega} \otimes \mathbf{q}]\right)
$$

```wgsl
fn quat_integrate(q: vec4f, omega: vec3f, dt: f32) -> vec4f {
    let h = 0.5 * dt;
    let dq = vec4f(
         h * ( omega.x*q.w + omega.y*q.z - omega.z*q.y),
         h * (-omega.x*q.z + omega.y*q.w + omega.z*q.x),
         h * ( omega.x*q.y - omega.y*q.x + omega.z*q.w),
         h * (-omega.x*q.x - omega.y*q.y - omega.z*q.z),
    );
    return quat_normalize(q + dq);
}
```

#### 1.4 Aplicação de delta angular (correção posicional XPBD)

Dado um vetor de correção **δθ** em world space, aplica a rotação infinitesimal ao quaternion:

$$
\tilde{\mathbf{q}} = \text{normalize}\!\left(\tilde{\mathbf{q}} + \tfrac{1}{2}\,[\boldsymbol{\delta\theta},\,0] \otimes \tilde{\mathbf{q}}\right)
$$

```wgsl
fn quat_apply_angular_delta(q: vec4f, delta: vec3f) -> vec4f {
    let dq = vec4f(
         delta.x*q.w + delta.y*q.z - delta.z*q.y,
         delta.y*q.w + delta.z*q.x - delta.x*q.z,
         delta.z*q.w + delta.x*q.y - delta.y*q.x,
        -delta.x*q.x - delta.y*q.y - delta.z*q.z,
    );
    return quat_normalize(q + 0.5 * dq);
}
```

A renormalização é **obrigatória** após cada correção — erros de ponto flutuante acumulados fazem o quaternion derivar de uma rotação unitária.

#### 1.5 Derivação de velocidade angular

Dado o delta de quaternion entre dois frames, extrai a velocidade angular:

$$
\Delta\mathbf{q} = \tilde{\mathbf{q}} \otimes \mathbf{q}^{-1}, \qquad
\boldsymbol{\omega} = \frac{2\,\text{sign}(\Delta q_w) \cdot \Delta\mathbf{q}_{xyz}}{\Delta t}
$$

```wgsl
fn quat_delta_omega(q_new: vec4f, q_old: vec4f, inv_dt: f32) -> vec3f {
    let cj = vec4f(-q_old.x, -q_old.y, -q_old.z, q_old.w);  // conjugado = inverso para unitários
    let dq = quat_mul(q_new, cj);
    let s  = select(-2.0 * inv_dt, 2.0 * inv_dt, dq.w >= 0.0);
    return dq.xyz * s;
}
```

---

### 2. Tensor de inércia e massa generalizada (`xpbd.wgsl`)

#### 2.1 Tensor de inércia

Resistência à rotação de um corpo rígido. O engine usa apenas a **diagonal** no espaço local — válida para geometrias convexas simétricas:

$$
\mathbf{I} = \begin{pmatrix} I_{xx} & 0 & 0 \\ 0 & I_{yy} & 0 \\ 0 & 0 & I_{zz} \end{pmatrix}
$$

O que é armazenado em `I_inv.xyz` é o inverso, pré-computado em CPU:

$$
\mathbf{I}^{-1}_{ii} = \begin{cases} 1/I_{ii} & \text{se } I_{ii} > 10^{-12} \\ 0 & \text{eixo travado} \end{cases}
$$

No shader, o produto **I⁻¹·v** é substituído por multiplicação componente a componente: `v * I_inv`.

#### 2.2 Massa generalizada

Resistência combinada de um corpo a um impulso ao longo do eixo **n** aplicado no ponto **r** (relativo ao CM):

$$
w(\mathbf{r}, \mathbf{n}) = m^{-1} + (\mathbf{r} \times \mathbf{n})^T \mathbf{I}^{-1} (\mathbf{r} \times \mathbf{n})
$$

O primeiro termo é a contribuição translacional; o segundo, a rotacional — maior quanto mais longe do CM e quanto mais alinhado com o eixo de menor inércia.

```wgsl
fn rigid_generalized_mass(r: vec3f, n: vec3f, inv_m: f32, I_inv: vec3f) -> f32 {
    let rxn = cross(r, n);
    let ang = rxn.x*rxn.x*I_inv.x + rxn.y*rxn.y*I_inv.y + rxn.z*rxn.z*I_inv.z;
    return inv_m + ang;
}
```

Para dois corpos A e B em contato: `w_total = w_A + w_B`. Esta função é compartilhada entre XPBD e LCP.

---

### 3. Matemática de contato (`contact_math.wgsl`, `impulse.wgsl`)

#### 3.1 Velocidade no ponto de contato

$$
\mathbf{v}_{\text{cp}} = \mathbf{v} + \boldsymbol{\omega} \times \mathbf{r}
$$

Onde **r** = vetor do CM ao ponto de contato (world frame).

```wgsl
fn contact_point_velocity(v_cm: vec3f, omega: vec3f, r: vec3f) -> vec3f {
    return v_cm + cross(omega, r);
}
```

#### 3.2 Tangente ortogonal (Frisvad)

Dado um vetor normal **n**, constrói um vetor tangente ortogonal numericamente estável. O threshold `1/√3 ≈ 0.577` garante norma pré-normalização ≥ `√(2/3) ≈ 0.816` em ambos os ramos:

```wgsl
fn tangent_orthogonal(n: vec3f) -> vec3f {
    if (abs(n.x) > 0.57735f) {
        return normalize(vec3f(n.y, -n.x, 0.0f));
    }
    return normalize(vec3f(0.0f, n.z, -n.y));
}
```

#### 3.3 Correção giroscópica

Corpos não-esféricos (ex: bastão girando) ganham energia angular espúria com integração de Euler simples. A correção subtrai o torque giroscópico:

$$
\boldsymbol{\tau}_g = \boldsymbol{\omega} \times (\mathbf{I}\,\boldsymbol{\omega}), \qquad
\boldsymbol{\omega}_g = \boldsymbol{\omega} - \mathbf{I}^{-1}\,\boldsymbol{\tau}_g \cdot \Delta t
$$

```wgsl
fn gyroscopic_correction(omega: vec3f, I: vec3f, dt: f32) -> vec3f {
    let Iw     = I * omega;
    let torque = cross(omega, Iw);
    let I_safe = max(I, vec3f(1e-6));
    return omega - (torque / I_safe) * dt;
}
```

Nota: `I` aqui é o tensor **não invertido** (calculado a partir de `I_inv` no shader de predict).

#### 3.4 Δλ unificado XPBD/LCP (`contact_math.wgsl`)

Formulação que serve tanto para XPBD (numerador = -C posicional) quanto para LCP (numerador = -(Jv + b) em velocidade):

$$
\Delta\lambda = \frac{\text{numerator}}{w + \alpha / h^2}
$$

```wgsl
fn delta_lambda_compliance(numerator: f32, eff_mass: f32, alpha: f32, h: f32) -> f32 {
    let denom = eff_mass + alpha / (h * h);
    return numerator / max(denom, 1e-10);
}
```

Para XPBD de contato rígido: `alpha = 0` → reduz a `-C / w`. Para LCP: `alpha = 0`, `h = dtSub` e numerator = `-(Jv + b)`.

---

## Parte II — Pipeline RigidBody

---

### 4. Structs de dados

#### 4.1 `RigidBody` — buffer `gpu_rb_bodies` (160 bytes, 10 × `vec4f`)

| Offset | Campo | Conteúdo |
|--------|-------|----------|
| 0 | `pos` | `xyz` = **p** (posição), `w` = **m⁻¹** |
| 4 | `vel` | `xyz` = **v** (velocidade linear) |
| 8 | `omega` | `xyz` = **ω** (velocidade angular) |
| 12 | `rot` | quaternion **q** (XYZW) |
| 16 | `I_inv` | `xyz` = diagonal de **I⁻¹** |
| 20 | `pos_pred` | `xyz` = **p̃**, `w` = **λₙ** acumulado |
| 24 | `rot_pred` | quaternion previsto **q̃** |
| 28 | `mat_props` | `x`=`e` (restituição), `y`=`μ` (fricção), `z`=`d_L`, `w`=`d_A` |
| 32 | `body_shape` | `x`=tipo de shape, `yz`=half-extents |
| 36 | `_pad` | reservado |

**Corpos cinemáticos**: `m⁻¹ = 0` — todos os kernels saltam com `if (inv_mass == 0.0) { return; }`.

#### 4.2 `RBSimParams` — uniform por frame

| Campo | Símbolo | Semântica |
|-------|---------|-----------|
| `gravity.xyz` | **g** | aceleração gravitacional (m/s²) |
| `gravity.w` | `dtSub` | duração do substep = `dt_frame / N` |
| `dt_frame` | `Δt` | duração do frame completo |
| `solve_iters` | `K` | iterações Gauss-Seidel por substep |
| `penetration_slop` | `σ` | tolerância de micro-penetração (m) |
| `baumgarte_beta` | `β` | fator de estabilização posicional LCP |
| `restitution_threshold` | — | abaixo desse Jv, `e = 0` |
| `sleep_lin_threshold` | `v_sleep` | threshold de pseudo-sleep (m/s) |
| `warm_start_factor` | `wsf` | escala do warm start LCP [0, 1] |
| `linear_damping` | `d_L` | coeficiente de amortecimento linear (1/s) |
| `angular_damping` | `d_A` | coeficiente de amortecimento angular (1/s) |

---

### 5. `rb_predict` — integração e predição

Executa 1× por frame, antes dos substeps. Para cada corpo dinâmico:

**1. Gravidade e damping:**

$$
\mathbf{v}_{\text{ext}} = \mathbf{v} + \mathbf{g}\,\Delta t, \qquad
\mathbf{v}_d = \mathbf{v}_{\text{ext}} \cdot (1 - d_L\,\Delta t)
$$

**2. Correção giroscópica e damping angular:**

$$
\boldsymbol{\omega}_g = \text{gyroscopic\_correction}(\boldsymbol{\omega}, \mathbf{I}, \Delta t), \qquad
\boldsymbol{\omega}_d = \boldsymbol{\omega}_g \cdot (1 - d_A\,\Delta t)
$$

**3. Predição:**

$$
\tilde{\mathbf{p}} = \mathbf{p} + \mathbf{v}_d\,\Delta t, \qquad
\tilde{\mathbf{q}} = \text{quat\_integrate}(\mathbf{q},\, \boldsymbol{\omega}_d,\, \Delta t)
$$

`vel` e `omega` **não são modificados** — preservados como referência para `rb_velocity_recovery`.

---

### 6. `rb_solve` — XPBD posicional (PGS)

Executa 1× por substep, serial (1 thread). Loop de K iterações Gauss-Seidel.

#### 6.1 Δλ XPBD de contato

Para cada contato ativo, com `α = 0` (contato rígido):

$$
\Delta\lambda = \frac{-C_{\text{eff}}}{w}, \qquad C_{\text{eff}} = \max(\text{depth} - \sigma,\; 0)
$$

Projeção Signorini (λₙ ≥ 0):

$$
\lambda_n^{\text{new}} = \max(\lambda_n^{\text{old}} + \Delta\lambda,\; 0), \qquad
\Delta\lambda_{\text{ef}} = \lambda_n^{\text{new}} - \lambda_n^{\text{old}}
$$

#### 6.2 Correção posicional e angular

$$
\tilde{\mathbf{p}} \mathrel{+}= m^{-1} \cdot \Delta\lambda_{\text{ef}} \cdot \mathbf{n}
$$

$$
\boldsymbol{\delta\theta} = \mathbf{I}^{-1} \cdot (\mathbf{r} \times \mathbf{n}) \cdot \Delta\lambda_{\text{ef}}, \qquad
\tilde{\mathbf{q}} = \text{quat\_apply\_angular\_delta}(\tilde{\mathbf{q}},\, \boldsymbol{\delta\theta})
$$

Renormalização obrigatória após cada aplicação.

#### 6.3 Fricção de Coulomb (por eixo)

Duas tangentes t₁ (velocidade tangencial normalizada) e t₂ = n × t₁. Clamp independente por eixo:

$$
\lambda_{t_k}^{\text{new}} = \text{clamp}(\lambda_{t_k}^{\text{old}} + \Delta\lambda_{t_k},\; -\mu\lambda_n,\; +\mu\lambda_n)
$$

---

### 7. `rb_velocity_recovery` — derivação de velocidades

Executa 1× por frame, após todos os substeps.

#### 7.1 Velocidade linear

$$
\mathbf{v}_{\text{new}} = \frac{\tilde{\mathbf{p}} - \mathbf{p}}{\Delta t_{\text{frame}}}
$$

**Divisor `Δt_frame`, não `dtSub`**: `p̃` acumulou correções de N substeps — dividir por `dtSub` amplificaria a velocidade por N (velocity explosion).

#### 7.2 Correção anti-arremesso

Decompõe a velocidade recuperada em componente ao longo de **ĝ** e perpendicular. Clampeia o componente de gravidade:

$$
\mathbf{v}_{\text{corr}} = \mathbf{v}_{\text{new}} - \mathbf{v}_{\text{esperada}}, \qquad
v_{\text{corr},g} = \mathbf{v}_{\text{corr}} \cdot \hat{\mathbf{g}}
$$

$$
v_{\text{corr},g}^{\text{clamped}} = \max(v_{\text{corr},g},\; -v_{\text{approach}} \cdot (1 + e))
$$

Impede que correções posicionais do solver gerem bounce explosivo.

#### 7.3 Velocidade angular

$$
\boldsymbol{\omega}_{\text{new}} = \text{quat\_delta\_omega}(\tilde{\mathbf{q}},\, \mathbf{q},\, 1/\Delta t)
$$

#### 7.4 Pseudo-sleep

$$
|\mathbf{v}|^2 < v_{\text{sleep}}^2 \;\wedge\; |\boldsymbol{\omega}|^2 < 25\,v_{\text{sleep}}^2 \;\Rightarrow\; \mathbf{v} = \mathbf{0},\; \boldsymbol{\omega} = \mathbf{0}
$$

Fator 25: `(5 rad/s)² / (1 cm/s)²` — threshold angular ~5× maior.

---

### 8. Pipeline LCP — `rb_build_lcp` + `rb_solve_lcp`

Resolve contatos no espaço de **velocidades** (ao contrário do XPBD que opera em posições).

#### 8.1 Jacobiano de contato

Para corpo A contra superfície estática:

$$
J = \begin{bmatrix} \mathbf{n}^T & (\mathbf{r}_A \times \mathbf{n})^T \end{bmatrix}
$$

Para dois corpos dinâmicos A e B:

$$
J = \begin{bmatrix} \mathbf{n}^T & (\mathbf{r}_A \times \mathbf{n})^T & -\mathbf{n}^T & -(\mathbf{r}_B \times \mathbf{n})^T \end{bmatrix}
$$

#### 8.2 Diagonal de Delassus — `J M⁻¹ Jᵀ`

O elemento diagonal `a_kk = J M⁻¹ Jᵀ` expandido para dois corpos:

$$
a_{kk} = \underbrace{m_A^{-1} + (\mathbf{r}_A \times \mathbf{n})^T \mathbf{I}_A^{-1} (\mathbf{r}_A \times \mathbf{n})}_{w_A} + \underbrace{m_B^{-1} + (\mathbf{r}_B \times \mathbf{n})^T \mathbf{I}_B^{-1} (\mathbf{r}_B \times \mathbf{n})}_{w_B}
$$

Numericamente idêntico a `w_A + w_B = rigid_generalized_mass(A) + rigid_generalized_mass(B)`.

```wgsl
fn delassus_diagonal(rb_i: RigidBody, rb_j: RigidBody,
                     ra: vec3f, rb_vec: vec3f, n: vec3f) -> f32 {
    return rigid_generalized_mass(ra,     n, rb_i.pos.w, rb_i.I_inv.xyz)
         + rigid_generalized_mass(rb_vec, n, rb_j.pos.w, rb_j.I_inv.xyz);
}
```

**Pré-computado** em paralelo em `rb_build_lcp`, armazenado em `contacts[ci].diagonal_n/t` — não recalculado a cada iteração PGS.

#### 8.3 Velocidade relativa J·v

$$
J\mathbf{v} = \mathbf{v}_{\text{cp}} \cdot \mathbf{n} = (\mathbf{v}_A + \boldsymbol{\omega}_A \times \mathbf{r}_A) \cdot \mathbf{n}
$$

#### 8.4 Bias b — Baumgarte + restituição

**Baumgarte** — feedback proporcional para corrigir penetração posicional no espaço de velocidades:

$$
b_{\text{Baumgarte}} = \frac{\beta}{\Delta t} \cdot \min(\text{gap} + \sigma,\; 0)
$$

**Restituição** — bounce proporcional à velocidade de aproximação (com threshold):

$$
b_{\text{rest}} = e \cdot J\mathbf{v} \quad \text{se } J\mathbf{v} < -v_{\text{threshold}}
$$

$$
b_k = b_{\text{Baumgarte}} + b_{\text{rest}}
$$

#### 8.5 Passo PGS — normal

$$
\Delta\lambda_k = \frac{-(J\mathbf{v} + b_k)}{a_{kk}}, \qquad
\lambda_k^{\text{new}} = \max(\lambda_k^{\text{old}} + \Delta\lambda_k,\; 0)
$$

```wgsl
fn lcp_pgs_step(j_v: f32, bias: f32, a_kk: f32, lambda_acc: f32) -> vec2f {
    let delta = -(j_v + bias) / max(a_kk, 1e-10);
    let new_l = max(lambda_acc + delta, 0.0);
    return vec2f(new_l - lambda_acc, new_l);
}
```

#### 8.6 Aplicação do impulso `Jᵀ Δλ`

Aplicado às velocidades (não posições):

$$
\mathbf{v}_A \mathrel{+}= m_A^{-1} \cdot \Delta\lambda_k \cdot \mathbf{n}, \qquad
\boldsymbol{\omega}_A \mathrel{+}= \mathbf{I}_A^{-1} \cdot (\mathbf{r}_A \times \mathbf{n}) \cdot \Delta\lambda_k
$$

#### 8.7 Fricção — disco de Coulomb 2D

O LCP projeta `λₜ = (λ_{t1}, λ_{t2})` no **disco** de raio `μλₙ` (cone isotrópico correto), ao contrário do clamp por eixo do XPBD:

$$
\boldsymbol{\lambda}_t^{\text{new}} = \begin{cases}
\boldsymbol{\lambda}_t^{\text{raw}} & \text{se } |\boldsymbol{\lambda}_t^{\text{raw}}| \leq \mu\lambda_n \\[4pt]
\mu\lambda_n \cdot \dfrac{\boldsymbol{\lambda}_t^{\text{raw}}}{|\boldsymbol{\lambda}_t^{\text{raw}}|} & \text{caso contrário}
\end{cases}
$$

```wgsl
fn lcp_pgs_step_friction(j_v_t: vec2f, a_kk_t: f32, lambda_t_acc: vec2f,
                          lambda_n: f32, mu: f32) -> vec4f {
    let delta   = -(j_v_t) / max(a_kk_t, 1e-10);
    let new_raw = lambda_t_acc + delta;
    let max_t   = mu * max(lambda_n, 0.0);
    let len     = length(new_raw);
    let clamped = select(new_raw, new_raw * (max_t / max(len, 1e-10)), len > max_t);
    return vec4f(clamped - lambda_t_acc, clamped);
}
```

#### 8.8 Warm start

Antes da iteração 0, aplica os impulsos do frame anterior escalonados por `wsf`:

$$
\mathbf{v}^{(0)} = \mathbf{v}_{\text{frame}} + M^{-1} J^T (\text{wsf} \cdot \boldsymbol{\lambda}^{\text{prev}})
$$

Coloca a solução inicial próxima da convergência — reduz drasticamente o número de iterações PGS para contatos persistentes.

#### 8.9 XPBD vs LCP

| | XPBD (`rb_solve`) | LCP (`rb_solve_lcp`) |
|---|---|---|
| Espaço | Posições (p̃, q̃) | Velocidades (v, ω) |
| Diagonal | `w = rigid_generalized_mass` | `a_kk = J M⁻¹ Jᵀ` (idêntico numericamente) |
| Pré-computa diagonal | Não (inline por iteração) | Sim (`rb_build_lcp`, paralelo) |
| Bias | Penetration slop apenas | Baumgarte + restituição |
| Fricção | Clamp por eixo (t₁, t₂ independentes) | Projeção no disco de Coulomb 2D |
| Warm start | Implícito via λ em `point.w` | Explícito: aplica impulsos antes da iteração 0 |
| Commit | `pos_pred → pos` em `rb_velocity_recovery` | `rb_lcp_commit` aplica Δvel diretamente |

---

## Parte III — Pipeline SoftBody

---

### 9. Struct `Particle`

Cada partícula ocupa 12 `f32` no buffer `gpu_particles_<uuid>`:

| Campo | Conteúdo |
|-------|----------|
| `pos.xyz` | posição atual **p** |
| `pos.w` | massa inversa **w = m⁻¹** (0 = fixada/kinematic) |
| `pred.xyz` | posição prevista **p̃** |
| `vel.xyz` | velocidade **v** |

A massa inversa por partícula é `w = N / m_total` (N = total de partículas, m_total = massa do corpo). Partículas fixadas têm `w = 0`.

---

### 10. `predict` — integração de partícula

$$
\tilde{\mathbf{p}} = \mathbf{p} + \mathbf{v}\,\Delta t + \mathbf{a}\,\Delta t^2
$$

Onde **a** = aceleração de forças externas (gravidade + forças funcionais).

---

### 11. `distance_solve` — constraint de distância XPBD

Constraint entre partículas `i` e `j`:

$$
C_{ij} = |\tilde{\mathbf{p}}_i - \tilde{\mathbf{p}}_j| - L_0
$$

`L₀` = comprimento de repouso da aresta. Massa generalizada para partículas (sem rotação):

$$
w_{\text{total}} = w_i + w_j
$$

Incremento de Lagrange:

$$
\Delta\lambda = \frac{-C_{ij}}{w_{\text{total}} + \tilde{\alpha}}, \qquad \tilde{\alpha} = \frac{\alpha}{\Delta t^2}
$$

Correções simétricas ao longo de **n̂ = (p̃ᵢ − p̃ⱼ) / |p̃ᵢ − p̃ⱼ|**:

$$
\tilde{\mathbf{p}}_i \mathrel{-}= w_i \cdot \Delta\lambda \cdot \hat{\mathbf{n}}, \qquad
\tilde{\mathbf{p}}_j \mathrel{+}= w_j \cdot \Delta\lambda \cdot \hat{\mathbf{n}}
$$

`α = 0` → constraint rígida. `α > 0` → constraint elástica (compliance).

---

### 12. Graph coloring — paralelismo GPU

Constraints que compartilham partículas não podem ser resolvidas simultaneamente (race condition de escrita em `p̃`). O graph coloring atribui cores de forma que constraints da mesma cor sejam independentes:

```
Cor 1: constraints {(0,1), (2,3), (4,5), ...}  → dispatch paralelo
Cor 2: constraints {(1,2), (3,4), (5,6), ...}  → dispatch paralelo
...
```

Cada cor é um dispatch separado. `K` cores = `K` passes por substep, mas totalmente paralelo dentro de cada pass.

---

### 13. `velocity_update` — derivação de velocidade de partícula

$$
\mathbf{v} = \frac{\tilde{\mathbf{p}} - \mathbf{p}}{\Delta t} \cdot d_{\text{damp}}, \qquad
\mathbf{p} \leftarrow \tilde{\mathbf{p}}
$$

---

## Referências

- Müller et al. 2020 — *Detailed Rigid Body Simulation with Extended Position Based Dynamics*
- Catto 2005 — *Iterative Dynamics with Temporal Coherence* (PGS-LCP, warm-starting, Baumgarte)
- Gregorius 2013 — *Robust Contact Creation for Physics Simulations*
- Frisvad 2012 — *Building an Orthonormal Basis from a 3D Unit Vector*
