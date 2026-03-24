# Estrutura Matemática para Calculadora de Geometria Diferencial (Versão Matricial 4D)

## 1. Definição da Superfície Paramétrica

Definição da superfície parametrica:

**Funções Paramétricas Iniciais:**

* Superfície Tubular Ondulada ($S_0$): <br/>
    $X_{0}(u, v) = u$ <br/>
    $Y_{0}(u, v) = \cos(v) \left(\frac{5}{2} - \frac{3}{2}\sin\left(\frac{u}{2}\right)\right)$<br/>
    $Z_{0}(u, v) = \sin(v) \left(\frac{5}{2} - \frac{3}{2}\sin\left(\frac{u}{2}\right)\right)$<br/>

* Superfície Tubular Cilíndrica ($S_1$):<br/>
    $X_{1}(u,v) = u$<br/>
    $Y_{1}(u, v) = \cos(v)\left(\frac{5}{2}\right)$<br/>
    $Z_{1}(u, v) = \sin(v)\left(\frac{5}{2}\right)$<br/>

**Homotopia linear (Deformação da Superfície):**

A superfície final, $S_h(u, v, t_i)$, é uma interpolação linear entre $S_0$ e $S_1$, onde $t_i \in [0, 1]$.<br/>
$$S_h(u, v, t_i) = (1-t_i)S_0(u,v) + t_iS_1(u,v)$$
Componente a componente:<br/>
$X_{h}(u,v,t_{i}) = (1-t_{i})X_{0}(u,v) + t_{i}X_{1}(u,v)$<br/>
$Y_{h}(u,v,t_{i}) = (1-t_{i})Y_{0}(u,v) + t_{i}Y_{1}(u,v)$<br/>
$Z_{h}(u,v,t_{i}) = (1-t_{i})Z_{0}(u,v) + t_{i}Z_{1}(u,v)$<br/>

---

## 2. O Pipeline de Transformação Matricial

A transformação de um vértice da superfície até a tela 2D é dada pela multiplicação de matrizes 4x4. Um ponto no espaço do modelo, $P_{modelo}$, é transformado em um ponto no espaço de recorte, $P_{clip}$, pela seguinte equação:

$$P_{clip} = P \cdot V \cdot M \cdot P_{modelo}$$

Onde:
* $P_{modelo}$: O ponto no espaço do objeto, em coordenadas homogêneas, e.g., $(X_h, Y_h, Z_h, 1)^T$.
* $M$: A Matriz de Modelo (transforma do espaço do modelo para o espaço do mundo).
* $V$: A Matriz de Visão (transforma do espaço do mundo para o espaço da câmera).
* $P$: A Matriz de Projeção (transforma do espaço da câmera para o espaço de recorte).

---

## 3. A Matriz de Modelo (M) - Posição e Orientação do Objeto

A matriz $M$ posiciona, orienta e escala o objeto no mundo. É composta por matrizes de Translação (T), Rotação (R) e Escala (S): $M = T \cdot R \cdot S$.

* **Ponto no Espaço do Modelo:**
    $$
    P_{modelo} = \begin{bmatrix} X_h(u,v,t_i) \\ Y_h(u,v,t_i) \\ Z_h(u,v,t_i) \\ 1 \end{bmatrix}
    $$

* **Matriz de Translação T($t_x, t_y, t_z$):**
    $$
    T =
    \begin{bmatrix}
    1 & 0 & 0 & t_x \\
    0 & 1 & 0 & t_y \\
    0 & 0 & 1 & t_z \\
    0 & 0 & 0 & 1
    \end{bmatrix}
    $$

* **Matrizes de Rotação Base (Passo a Passo):**
    A rotação final é uma composição de rotações em torno dos eixos principais. Usando a convenção de ângulos de Tait-Bryan ZYX:
    * **Rotação em torno do eixo Z (Yaw, $\theta_{yaw}$):**
        $$
        R_z(\theta_{yaw}) =
        \begin{bmatrix}
        \cos(\theta_{yaw}) & -\sin(\theta_{yaw}) & 0 & 0 \\
        \sin(\theta_{yaw}) & \cos(\theta_{yaw}) & 0 & 0 \\
        0 & 0 & 1 & 0 \\
        0 & 0 & 0 & 1
        \end{bmatrix}
        $$
    * **Rotação em torno do eixo Y (Pitch, $\theta_{pitch}$):**
        $$
        R_y(\theta_{pitch}) =
        \begin{bmatrix}
        \cos(\theta_{pitch}) & 0 & \sin(\theta_{pitch}) & 0 \\
        0 & 1 & 0 & 0 \\
        -\sin(\theta_{pitch}) & 0 & \cos(\theta_{pitch}) & 0 \\
        0 & 0 & 0 & 1
        \end{bmatrix}
        $$
    * **Rotação em torno do eixo X (Roll, $\theta_{roll}$):**
        $$
        R_x(\theta_{roll}) =
        \begin{bmatrix}
        1 & 0 & 0 & 0 \\
        0 & \cos(\theta_{roll}) & -\sin(\theta_{roll}) & 0 \\
        0 & \sin(\theta_{roll}) & \cos(\theta_{roll}) & 0 \\
        0 & 0 & 0 & 1
        \end{bmatrix}
        $$

* **Matriz de Rotação Composta (R):**
    A ordem de multiplicação define a rotação final. A ordem ZYX é comum:
    $$
    R = R_z(\theta_{yaw}) \cdot R_y(\theta_{pitch}) \cdot R_x(\theta_{roll})
    $$

    $$
    R =
    \begin{bmatrix}
    \cos(\theta_{yaw})\cos(\theta_{pitch}) & \cos(\theta_{yaw})\sin(\theta_{pitch})\sin(\theta_{roll}) - \sin(\theta_{yaw})\cos(\theta_{roll}) & \cos(\theta_{yaw})\sin(\theta_{pitch})\cos(\theta_{roll}) + \sin(\theta_{yaw})\sin(\theta_{roll}) & 0 \\
    \sin(\theta_{yaw})\cos(\theta_{pitch}) & \sin(\theta_{yaw})\sin(\theta_{pitch})\sin(\theta_{roll}) + \cos(\theta_{yaw})\cos(\theta_{roll}) & \sin(\theta_{yaw})\sin(\theta_{pitch})\cos(\theta_{roll}) - \cos(\theta_{yaw})\sin(\theta_{roll}) & 0 \\
    -\sin(\theta_{pitch}) & \cos(\theta_{pitch})\sin(\theta_{roll}) & \cos(\theta_{pitch})\cos(\theta_{roll}) & 0 \\
    0 & 0 & 0 & 1
    \end{bmatrix}
    $$

    
* **Matriz de Modelo Final (M):**
    Assumindo escala unitária, $M = T \cdot R$.
    

    $$
    M =
    \begin{bmatrix}
    \cos(\theta_{yaw})\cos(\theta_{pitch}) & \cos(\theta_{yaw})\sin(\theta_{pitch})\sin(\theta_{roll}) - \sin(\theta_{yaw})\cos(\theta_{roll}) & \cos(\theta_{yaw})\sin(\theta_{pitch})\cos(\theta_{roll}) + \sin(\theta_{yaw})\sin(\theta_{roll}) & t_x \\
    \sin(\theta_{yaw})\cos(\theta_{pitch}) & \sin(\theta_{yaw})\sin(\theta_{pitch})\sin(\theta_{roll}) + \cos(\theta_{yaw})\cos(\theta_{roll}) & \sin(\theta_{yaw})\sin(\theta_{pitch})\cos(\theta_{roll}) - \cos(\theta_{yaw})\sin(\theta_{roll}) & t_y \\
    -\sin(\theta_{pitch}) & \cos(\theta_{pitch})\sin(\theta_{roll}) & \cos(\theta_{pitch})\cos(\theta_{roll}) & t_z \\
    0 & 0 & 0 & 1
    \end{bmatrix}
    $$

    $$
    P_{mundo} = M \cdot P_{modelo}
    $$

    $$
    P_{mundo} =
    \begin{bmatrix}
    x' \\
    y' \\
    z' \\
    1
    \end{bmatrix}
    =
    \begin{bmatrix}
    m_{11} & m_{12} & m_{13} & m_{14} \\
    m_{21} & m_{22} & m_{23} & m_{24} \\
    m_{31} & m_{32} & m_{33} & m_{34} \\
    m_{41} & m_{42} & m_{43} & m_{44}
    \end{bmatrix}
    \begin{bmatrix}
    X_h \\
    Y_h \\
    Z_h \\
    1
    \end{bmatrix}
    =
    \begin{bmatrix}
    m_{11}X_h + m_{12}Y_h + m_{13}Z_h + m_{14} \\
    m_{21}X_h + m_{22}Y_h + m_{23}Z_h + m_{24} \\
    m_{31}X_h + m_{32}Y_h + m_{33}Z_h + m_{34} \\
    1
    \end{bmatrix}
    $$
---

## 4. A Matriz de Visão (V) - A Câmera

A matriz $V$ transforma o mundo para o referencial da câmera. É a inversa da matriz de transformação da câmera no mundo, $C_{mundo}$.

$$
C_{mundo} =
\begin{bmatrix}
s_x & u_x & -f_x & c_x \\
s_y & u_y & -f_y & c_y \\
s_z & u_z & -f_z & c_z \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

### Decomposição da Matriz $C_{mundo}$

Para entender essa matriz, vamos analisar suas colunas:

* **As 3 Primeiras Colunas (Orientação)**: Elas formam a base ortonormal que representa a **orientação** da câmera no mundo.
    * **1ª Coluna $(s_x, s_y, s_z)$**: É o vetor $\vec{s}$, o eixo "direito" (right) da câmera.
    * **2ª Coluna $(u_x, u_y, u_z)$**: É o vetor $\vec{u}$, o eixo "para cima" (up) da câmera.
    * **3ª Coluna $(-f_x, -f_y, -f_z)$**: É o vetor $-\vec{f}$, o eixo "para trás" da câmera. Corresponde ao eixo Z local da câmera, que aponta para longe da cena que está sendo vista (já que, por convenção, a câmera olha na direção de seu eixo -Z).

* **A 4ª Coluna (Posição)**: Ela representa a **translação** da câmera.
    * **$(c_x, c_y, c_z)$**: É o vetor de posição $C_{pos}$, o ponto exato no espaço do mundo onde a câmera está localizada.

* **Base da Câmera:**
    * Posição: $C_{pos} = (c_x, c_y, c_z)^T$
    * Vetor "para a frente" (eixo z local): $\vec{f}$
    * Vetor "para cima" (eixo y local): $\vec{u}$
    * Vetor "para a direita" (eixo x local): $\vec{s} = \vec{u} \times \vec{f}$

* **Matriz de Visão (V):**
    - Inverta a parte da Rotação: A inversa de uma matriz de rotação (que é ortonormal) é simplesmente sua transposta.
    - Inverta a parte da Translação: A nova translação é o vetor de translação original negado e depois rotacionado pela rotação inversa.
    $$
    V = (C_{mundo})^{-1} =
    \begin{bmatrix}
    s_x & s_y & s_z & -(\vec{s} \cdot C_{pos}) \\
    u_x & u_y & u_z & -(\vec{u} \cdot C_{pos}) \\
    -f_x & -f_y & -f_z & -(-\vec{f} \cdot C_{pos}) \\
    0 & 0 & 0 & 1
    \end{bmatrix}
    $$
    (Nota: A convenção do OpenGL olha na direção -Z, por isso os sinais de `f` são invertidos).

* **Transformação para o Espaço da Câmera:**
    $$
    P_{camera} = V \cdot P_{mundo}
    $$

---

## 5. A Matriz de Projeção (P) - A Lente

A matriz $P$ projeta a cena 3D do espaço da câmera para um cubo canônico 2D (espaço de recorte).

* **Matriz de Projeção Ortográfica ($P_{ortho}$):**
    Definida por um volume de visualização retangular (`left, right, bottom, top`) e limites de profundidade (`near, far`).
    $$
    P_{ortho} =
    \begin{bmatrix}
    \frac{2}{right-left} & 0 & 0 & -\frac{right+left}{right-left} \\
    0 & \frac{2}{top-bottom} & 0 & -\frac{top+bottom}{top-bottom} \\
    0 & 0 & \frac{-2}{far-near} & -\frac{far+near}{far-near} \\
    0 & 0 & 0 & 1
    \end{bmatrix}
    $$

* **Transformação Final:**
    $$
    P_{clip} = P_{ortho} \cdot P_{camera}
    $$
    O vetor resultante `P_clip` é então processado pelo hardware (divisão por W e transformação de viewport) para gerar as coordenadas de tela (x, y).

---

## 6. Geometria Diferencial (Estrutura Invariante)

Estes cálculos são realizados no espaço do modelo ou do mundo, antes da transformação de visão, e permanecem os mesmos.

* **Vetores Tangentes (Colunas da Matriz Jacobiana J):**
    $$
    \vec{T_u} = \frac{\partial S_h}{\partial u} = \begin{bmatrix} X_u \\ Y_u \\ Z_u \end{bmatrix} \quad , \quad \vec{T_v} = \frac{\partial S_h}{\partial v} = \begin{bmatrix} X_v \\ Y_v \\ Z_v \end{bmatrix}
    $$

* **Primeira Forma Fundamental (Matriz Métrica $g$):**
    $$
    g = J^T J =
    \begin{bmatrix}
    \vec{T_u} \cdot \vec{T_u} & \vec{T_u} \cdot \vec{T_v} \\
    \vec{T_v} \cdot \vec{T_u} & \vec{T_v} \cdot \vec{T_v}
    \end{bmatrix}
    =
    \begin{bmatrix}
    E(u,v) & F(u,v) \\
    F(u,v) & G(u,v)
    \end{bmatrix}
    $$

* **Vetor Normal:**
    $$
    \vec{N}(u,v) = \vec{T_u} \times \vec{T_v} = (N_x, N_y, N_z)^T
    $$
    $$
    \vec{n}(u,v) = \frac{\vec{N}}{||\vec{N}||} \text{ (Vetor Normal Unitário)}
    $$

* **Segunda Forma Fundamental (Operador de Forma $L_{ij}$):**
    As componentes L, M, N são dadas por $L = \vec{S}_{uu} \cdot \vec{n}$, $M = \vec{S}_{uv} \cdot \vec{n}$, $N = \vec{S}_{vv} \cdot \vec{n}$.
    $$
    L_{ij} =
    \begin{bmatrix}
    L(u,v) & M(u,v) \\
    M(u,v) & N(u,v)
    \end{bmatrix}
    $$

---

## 7. Geração da Malha (Grid)

A geração da malha permanece como um processo de amostragem no espaço de parâmetros `(u,v)`, usando as funções `α` e `β` para gerar as coordenadas que serão então renderizadas.

* **Funções de Amostragem:**
    $$
    \alpha(t, n) = \left(\frac{\operatorname{floor}(t(n+1))}{n} - 0.5\right)
    $$
    $$
    \beta(t, n) = t(n+1) - \operatorname{floor}(t(n+1)) - 0.5
    $$

## 8. Interatividade: Pan, Zoom e Malha Adaptativa

Esta seção detalha como a interação do usuário, através do Pan e do Zoom, influencia dinamicamente os parâmetros de renderização, como o volume de visão e a densidade da malha.

### 8.1 Ponto de Foco e Pan

O Pan, ou a navegação pela superfície, é controlado por um ponto central no espaço de parâmetros, $(u_1, v_1)$. Este ponto serve como o foco para todas as operações locais.

* **Coordenadas de Foco (Pan):**
    $$ u_1, v_1 $$
* **Funcionalidade:** Alterar os valores de $u_1$ e $v_1$ permite que o usuário "deslize" o ponto de vista sobre a superfície. A câmera e a janela de zoom se reajustam em torno deste novo ponto focal.

### 8.2 Sistema de Zoom e Cálculo do Volume de Visão

O nível de zoom, controlado pelo fator $k$, define o tamanho da "janela" de parâmetros que será visível. Esta janela determina os limites (`left, right, bottom, top`) para a Matriz de Projeção Ortográfica.

* **Parâmetros de Entrada:**
    * Fator de Zoom: $k$
    * Intervalos totais do domínio: $\Delta_{U} = u_{range}[2] - u_{range}[1]$, $\Delta_{V} = v_{range}[2] - v_{range}[1]$

* **Passo 1: Calcular a Largura da Janela de Zoom:**
    A largura da janela no espaço de parâmetros é inversamente proporcional ao fator de zoom.
    $$ F_{deltau} = \frac{\Delta_{U}}{k} \quad , \quad F_{deltav} = \frac{\Delta_{V}}{k} $$

* **Passo 2: Definir os Limites do Volume de Visão:**
    Os limites são calculados centralizando a janela de zoom no ponto de foco $(u_1, v_1)$.
    $$ u_{min} = u_1 - \frac{F_{deltau}}{2} \quad , \quad u_{max} = u_1 + \frac{F_{deltau}}{2} $$
    $$ v_{min} = v_1 - \frac{F_{deltav}}{2} \quad , \quad v_{max} = v_1 + \frac{F_{deltav}}{2} $$
    Esses quatro valores são usados diretamente como os parâmetros `left`, `right`, `bottom` e `top` na Matriz de Projeção Ortográfica, $P_{ortho}$.

### 8.3 Malha Adaptativa (Cálculo da Densidade via Zoom)

A densidade da malha (o número de linhas do grid, `n`) não é fixa. Ela se adapta ao nível de zoom e à "esticada" (métrica) da superfície no ponto focal para manter uma densidade visual consistente na tela.

* **Parâmetros de Entrada:**
    * Tamanho de referência do pixel: $h_{pix}$ (e.g., $h_{pix} = 1$)
    * Métrica no ponto focal: $E_{foco} = E(u_1, v_1)$ e $G_{foco} = G(u_1, v_1)$

* **Passo 1: Determinar o Passo de Amostragem Ideal:**
    Calcula-se qual deve ser o "passo" nos eixos `u` e `v` para que a distância percorrida na superfície corresponda a um pixel na tela, ajustado pelo zoom.
    $$ P_{assou} = \frac{h_{pix}}{k \cdot \sqrt{E_{foco}}} \quad , \quad P_{assov} = \frac{h_{pix}}{k \cdot \sqrt{G_{foco}}} $$

* **Passo 2: Calcular o Número de Subdivisões Necessárias:**
    Divide-se a largura da janela de visão atual pelo passo de amostragem ideal para saber quantas linhas são necessárias para preencher a tela.
    $$ S_u = \frac{u_{max}-u_{min}}{P_{assou}} \quad , \quad S_v = \frac{v_{max}-v_{min}}{P_{assov}} $$

* **Passo 3: Definir a Densidade Final da Malha:**
    A densidade final da malha principal, `n`, é o maior valor entre as subdivisões de `u` e `v` para garantir que a parte mais "esticada" da grade ainda pareça densa.
    $$ n = \max(S_u, S_v) $$

### 8.4 Construção e Renderização da Malha (Grid)

Com a densidade `n` calculada, a malha é construída usando as funções de amostragem $\alpha$ e $\beta$ em dois níveis de detalhe.

* **Níveis de Subdivisão:**
    * Malha Principal (Major): $S_{mj} = n$
    * Malha Secundária (Minor): $S_{mi} = 8 \cdot S_{mj}$

* **Funções de Amostragem:**
    $$ \alpha(t, S) = \left(\frac{\operatorname{floor}(t(S+1))}{S} - 0.5\right) $$
    $$ \beta(t, S) = t(S+1) - \operatorname{floor}(t(S+1)) - 0.5 $$

* **Renderização das Linhas da Malha:**
    As linhas da malha são renderizadas aplicando as funções de amostragem à parametrização da superfície $S_h(u, v)$. Por exemplo, para desenhar a malha principal (major):

    * **Linhas "Verticais" (u varia, v constante):**
    $$ S_h\left( (u_{max}-u_{min})\beta(t, S_{mj}) + u_{min}, \quad (v_{max}-v_{min})\alpha(t, S_{mj}) + v_{min} \right) $$
    * **Linhas "Horizontais" (v varia, u constante):**
    $$ S_h\left( (u_{max}-u_{min})\alpha(t, S_{mj}) + u_{min}, \quad (v_{max}-v_{min})\beta(t, S_{mj}) + v_{min} \right) $$
    (O mesmo processo é repetido usando $S_{mi}$ para a malha secundária).