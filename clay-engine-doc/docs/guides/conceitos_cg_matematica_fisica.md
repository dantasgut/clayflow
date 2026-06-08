---
sidebar_position: 2
title: Conceitos — Computação Gráfica, Matemática e Física
description: Fundamentos transversais ao motor — sistemas de coordenadas e espaços, transformações (modelo/visão/projeção), quaternions, geometria diferencial, integração numérica e bases de colisão.
---

# Conceitos — Computação Gráfica, Matemática e Física

Este guia reúne os **fundamentos transversais** usados por todo o motor: os espaços e transformações que
levam um vértice do objeto até a tela, a álgebra das rotações, a geometria diferencial das superfícies e a
integração numérica que move a simulação. É a base teórica referenciada pelos guias de pipeline e física.

> Para o tratamento aplicado, veja [Hierarquia de Objetos 3D](./10_Hierarquia_Objetos_3D.md) (vértices, PBR,
> instancing), [Matemática do XPBD](./fisica_matematica_xpbd.md) (quaternions, deformação, Neo-Hookean) e
> [Colisões](./colisoes.md) (impulsos, atrito, estabilização).

## 1. Sistemas de coordenadas e espaços

Um vértice atravessa uma cadeia de espaços até virar pixel:

```
Espaço do Modelo --(M)--> Espaço do Mundo --(V)--> Espaço da Câmera --(P)--> Clip --(÷w)--> NDC --> Tela
```

| Espaço | Origem | Usado para |
| :--- | :--- | :--- |
| **Modelo (object)** | centro do objeto | posições dos vértices na malha |
| **Mundo (world)** | origem da cena | posicionar/orientar objetos entre si |
| **Câmera (view)** | olho da câmera | iluminação, depth, culling |
| **Clip** | cubo canônico homogêneo | recorte (clipping) pelo hardware |
| **NDC** | após divisão por `w` | coordenadas normalizadas de dispositivo |
| **Tela (screen)** | pixel | rasterização final |

**Convenções WebGPU** (importantes para a matriz de projeção): o volume de clip tem profundidade
$z \in [0, 1]$ (e não $[-1, 1]$ como no OpenGL), $y$ aponta para **cima** em NDC, e a origem da textura do
framebuffer fica no canto **superior-esquerdo**. Projeções herdadas de convenções OpenGL precisam ajustar o
mapeamento de `z`.

## 2. Transformações — a Matriz de Modelo (M)

A matriz de modelo posiciona, orienta e escala o objeto: $M = T \cdot R \cdot S$.

**Translação** $T(t_x, t_y, t_z)$:

$$
T = \begin{bmatrix} 1 & 0 & 0 & t_x \\ 0 & 1 & 0 & t_y \\ 0 & 0 & 1 & t_z \\ 0 & 0 & 0 & 1 \end{bmatrix}
$$

**Rotações base** (convenção Tait-Bryan ZYX — yaw/pitch/roll):

$$
R_z(\theta) = \begin{bmatrix} \cos\theta & -\sin\theta & 0 & 0 \\ \sin\theta & \cos\theta & 0 & 0 \\ 0 & 0 & 1 & 0 \\ 0 & 0 & 0 & 1 \end{bmatrix}
\quad
R_y(\theta) = \begin{bmatrix} \cos\theta & 0 & \sin\theta & 0 \\ 0 & 1 & 0 & 0 \\ -\sin\theta & 0 & \cos\theta & 0 \\ 0 & 0 & 0 & 1 \end{bmatrix}
\quad
R_x(\theta) = \begin{bmatrix} 1 & 0 & 0 & 0 \\ 0 & \cos\theta & -\sin\theta & 0 \\ 0 & \sin\theta & \cos\theta & 0 \\ 0 & 0 & 0 & 1 \end{bmatrix}
$$

A rotação composta é $R = R_z(\theta_{yaw}) \cdot R_y(\theta_{pitch}) \cdot R_x(\theta_{roll})$. A **ordem
importa** — multiplicação de matrizes não comuta. Para evitar *gimbal lock*, o motor representa orientação por
**quaternions** (§4) e converte para matriz apenas no upload.

Aplicada a um ponto homogêneo $P_{modelo} = (x, y, z, 1)^T$, obtém-se $P_{mundo} = M \cdot P_{modelo}$.

## 3. A Matriz de Visão (V) — a câmera

A câmera define uma base ortonormal no mundo: $\vec{s}$ (right), $\vec{u}$ (up), $\vec{f}$ (forward), e uma
posição $C_{pos}$. A matriz de visão é a **inversa** da transformação da câmera no mundo. Como a parte
rotacional é ortonormal, sua inversa é a transposta; a translação é negada e rotacionada:

$$
V = \begin{bmatrix}
s_x & s_y & s_z & -(\vec{s} \cdot C_{pos}) \\
u_x & u_y & u_z & -(\vec{u} \cdot C_{pos}) \\
-f_x & -f_y & -f_z & -(-\vec{f} \cdot C_{pos}) \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

(Os controllers — `OrbitController`, `FpsController`, `FlyController` — produzem essa base a cada frame.)

## 4. A Matriz de Projeção (P)

**Ortográfica** (volume retangular `left/right/bottom/top` + `near/far`):

$$
P_{ortho} = \begin{bmatrix}
\frac{2}{r-l} & 0 & 0 & -\frac{r+l}{r-l} \\
0 & \frac{2}{t-b} & 0 & -\frac{t+b}{t-b} \\
0 & 0 & \frac{-1}{f-n} & -\frac{n}{f-n} \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

**Perspectiva** (campo de visão vertical `fovy`, razão de aspecto `a`), mapeando para o clip WebGPU
($z \in [0,1]$):

$$
P_{persp} = \begin{bmatrix}
\frac{1}{a\,\tan(fovy/2)} & 0 & 0 & 0 \\
0 & \frac{1}{\tan(fovy/2)} & 0 & 0 \\
0 & 0 & \frac{f}{n-f} & \frac{n\,f}{n-f} \\
0 & 0 & -1 & 0
\end{bmatrix}
$$

O resultado $P_{clip}$ passa por **divisão por `w`** (divisão perspectiva) e pela transformação de viewport
para gerar as coordenadas de tela.

## 5. Quaternions — rotação sem gimbal lock

Um quaternion unitário $q = (x, y, z, w)$ representa uma rotação de ângulo $\theta$ em torno do eixo unitário
$\hat{n}$: $q = (\hat{n}\sin\tfrac{\theta}{2},\, \cos\tfrac{\theta}{2})$. Vantagens sobre ângulos de Euler:
composição barata ($q_1 q_2$), interpolação suave (slerp), e ausência de gimbal lock. A física de corpos
rígidos integra a velocidade angular $\omega$ diretamente sobre $q$. A derivação completa (incluindo a
integração de $\dot q = \tfrac{1}{2}\,\omega\,q$) está em [Matemática do XPBD](./fisica_matematica_xpbd.md).

## 6. Geometria diferencial de superfícies

Para geometrias paramétricas $S(u,v)$, as quantidades abaixo são **invariantes** ao espaço de visão (vivem no
modelo/mundo):

**Vetores tangentes** (colunas da Jacobiana $J$):

$$
\vec{T_u} = \frac{\partial S}{\partial u}, \qquad \vec{T_v} = \frac{\partial S}{\partial v}
$$

**Primeira forma fundamental** (métrica $g = J^T J$) — comprimentos e ângulos sobre a superfície:

$$
g = \begin{bmatrix} \vec{T_u}\cdot\vec{T_u} & \vec{T_u}\cdot\vec{T_v} \\ \vec{T_v}\cdot\vec{T_u} & \vec{T_v}\cdot\vec{T_v} \end{bmatrix} = \begin{bmatrix} E & F \\ F & G \end{bmatrix}
$$

**Normal** (para shading e colisão): $\vec{n} = \dfrac{\vec{T_u} \times \vec{T_v}}{\lVert \vec{T_u} \times \vec{T_v} \rVert}$.

**Segunda forma fundamental** ($L = S_{uu}\cdot\vec n,\ M = S_{uv}\cdot\vec n,\ N = S_{vv}\cdot\vec n$) — curvatura,
base para malhas adaptativas. O caso de estudo completo (superfícies tubulares, homotopia, malha adaptativa por
zoom) está arquivado em `notes/math.md`.

## 7. Integração numérica

A simulação avança o estado por passos discretos $\Delta t$. O motor usa **Euler semi-implícito**
(symplectic Euler), estável para forças conservativas:

$$
v_{t+1} = v_t + a_t\,\Delta t, \qquad x_{t+1} = x_t + v_{t+1}\,\Delta t
$$

Note que a posição usa a velocidade **já atualizada** — essa pequena troca é o que torna o método estável
frente ao Euler explícito. Para rigidez alta, cada frame é dividido em **substeps** (vários $\Delta t$ menores),
o que melhora a convergência sem aumentar a rigidez numérica — princípio central do XPBD e do MPM.

## 8. Bases de colisão e restrições

- **Restrição (constraint)**: uma função $C(x) = 0$ que o solver projeta a cada iteração (ex.: distância,
  contato, volume). O XPBD resolve restrições no espaço de posição com *compliance* $\alpha$.
- **Impulso**: variação instantânea de momento ($\Delta p = J$) aplicada no contato; o limite de Coulomb
  $|J_t| \le \mu J_n$ governa o atrito.
- **Massa efetiva e Baumgarte**: ver o tratamento completo em [Colisões](./colisoes.md).

---

> **Veja também:** [Hierarquia de Objetos 3D](./10_Hierarquia_Objetos_3D.md) ·
> [Matemática do XPBD](./fisica_matematica_xpbd.md) · [Colisões](./colisoes.md) ·
> [Métodos de simulação de partículas](./metodos_simulacao_particulas.md).
