# 10. O Clímax: Matemática de Engine 3D e As Três Camadas (Scene Graph)

A essência fundamental para construir gráficos e objetos interativos não está nos comandos secos de API (`writeBuffer`), mas sim na sua arquitetura matemática e na abstração do hardware. Uma Engine 3D ou Objeto Múltiplo (como um personagem com espada ou um barril de madeira hiper-realista) é construído obedecendo estritamente **Três Camadas** lógicas matemáticas fundamentais.

---

## Camada 1: A Malha (Mesh) e a base da Álgebra Linear

Um modelo 3D complexo é visualizado e emulado eletronicamente apenas com listas geométricas maciças de números flutuantes.

![Diagrama de Álgebra Linear: Convenção de Eixos da WebGPU (Red=X, Green=Y, Blue=Z)](/home/cerberus/.gemini/antigravity/brain/5fd7f7f5-b5e7-456e-9d0d-9eac36580b7a/schematic_mesh_vectors_rgb_1772992119894.png)

> [!CAUTION]
> **A Confusão Universal de Coordenadas (Left-Handed vs Right-Handed)**
> Diferente do OpenGL clássico (onde o eixo Z é _Right-Handed_ e aponta negativamente para dentro da tela), a **WebGPU adota o NDC estritamente _Left-Handed_** (Regra da Mão Esquerda). 
> Na placa gráfica da WebGPU, as grandezas obedecem rigorosamente este padrão físico:
> *   Eixo **X (+)** (Vermelho na imagem) representa a Largura e cresce para a **Direita**.
> *   Eixo **Y (+)** (Verde na imagem) representa a Altura e cresce para **Cima** (diferente do Vulkan).
> *   Eixo **Z (+)** (Azul na imagem) representa a Profundidade e cresce **em direção ao Fundo da tela** se afastando do jogador (indo de 0.0 até 1.0).

A unidade atômica da Camada 1 é o **Vértice**. No entanto, a GPU não trata um vértice como um pequeno caroço flutuando no espaço; ela o trata como um **Vetor de Posição** ($\vec{v}$).

*   **O Vetor de Posição ($v$)**: É uma flecha que emana obrigatoriamente do ponto de Origem do universo `(0, 0, 0)` e estica sua ponta até tocar a sua coordenada matemática alvo, formada por 3 eixos escalares: `[x, y, z]`.
*   Todo vetor possui **Magnitude** (comprimento total da flecha) calculada puramente pelo Teorema de Pitágoras Expandido, cuja notação é expressa matematicamente como: 
    $$||\vec{v}|| = \sqrt{x^2 + y^2 + z^2}$$
*   Além da magnitude, o vetor dita a exata **Direção** apontada dentro do sistema Cartesiano.

A Malha (Mesh/Wireframe) ganha vida quando o **Hardware** conecta (usando O Index Buffers) a cabeça de 3 vetores de posição adjacentes formando triângulos e polígonos perfeitamente rasos no espaço matemático. As faces do seu Barril acabam de nascer, mas ainda oco e invisível.

---

## Camada 2: O Material (UV Mapping e Espaço Tangente)

A geometria oca precisa reagir simulando fotônios e ganhar textura. Essa é a Camada 2, puramente dependente de projeção de cor em superfícies.

### Parte A: O Desdobramento UV (UV Mapping)

Como embrulhamos uma textura fotográfica ou um desenho liso bidimensional sobre uma casca curva matemática complexa de C++? 
Através das coordenadas de mapeamento desdobráveis `UV`.

Cada Vetor ($x,y,z$) ganha um atributo associado secundário: um número de proporção planar ($u, v$). Onde `U: 0.0, V: 0.0` é o fim esquerdo da foto e `U: 1.0, V:1.0` é extremidade direita-inferior. Isso instrui o rasterizador a pinçar o exato pontinho de cor da matriz fotográfica para cada nanômetro do triângulo durante o Shader.

### Parte B: Normal Mapping, Matriz TBN e Produto Vetorial 

Se queremos desenhar cortes de machado super fundos na textura ou relevos em um Barril sem gastar e desenhar polígonos reais, usamos um mapa auxiliar (O Normal Map). Uma imagem onde a cor (Roxo/Verde/Ciano) dita matematicamente vetores falsos de sombra.

Mas o mapa falso (Textura) está achatado em **Espaço Tangente (Tangent Space)**, uma dimensão local bidimensional espremida em cada triângulo onde *"Azul / Eixo Z"*, não aponta para frente ou para trás no mapa estelar, ele sempre sempre aponta **para Fora da Face Exata do respectivo triângulo cego.**

![Diagrama Esquemático: A textura de Normal Mapping sento 'amassada/projetada' na Face Geométrica para calcular os eixos TBN e Relevo de Luz](/home/cerberus/.gemini/antigravity/brain/5fd7f7f5-b5e7-456e-9d0d-9eac36580b7a/schematic_normal_mapping_1772989902956.png)

Como a placa converte as sombras roxas presas naquele triângulo deformado na tela pra elas convergirem e piscarem contra o Grande Sol Universal iluminiando todo o Mapa do nosso jogo?
Nós calculamos e unimos os dois mundos invocando a **Bússola/Matriz TBN** no Shader por intermédio da álgebra vetorial pura:

1. Extraímos os dois vetores primários informados: A Flecha Cega frontal nativa **`N` (Normal)** e A Flecha Paralela ditada desenhando para onde a textura UV corre ao longo da face, `T` **(Tangent)**.
2. Nós disparamos o **Produto Vetorial (Cross Product)** na GPU do tipo:
   $$ \vec{B} = \vec{N} \times \vec{T} $$ 
   *Isso força o aparecimento da terceira flecha puramente ortogonal (A Bitangente $B$). O Eixo X,Y,Z ordinário acabou de virar o Espaço de Eixos T,B,N.*
3. Por fim, **Produto Escalar (Dot Product)**: Para saber se a ranhura de madeira falsa brilha, nós comparamos o angulo entre a direção em que aquele pixel roxo convertido aponta no TBN contra a Direção vinda do Sol. Tudo obedece à *Intensidade da Refletância Lambertiana ($I$)* através do cálulo clássico Escalar:
   $$ P_{Cor} = Cor_{bruta} \cdot max(\vec{NormalMapeamento_{TBN}} \cdot \vec{Luz_{SolReal}}, 0)$$

---

## Camada 3: Transformações (Matrizes da Câmera no Pipeline)

A sua malha existe com material em `[0,0,0]`. Para ela se mover rodopiando a 500 metros sobre uma cidade com a Câmera seguindo ela a 5 metros de distância, você não "anda" com ela, você deforma tudo com O Motor Geométrico das Matrizes ($M_{4x4}$).

![Diagrama Esquemático de Transformações: Objeto Barril -> Cena Mundo -> Visão de Camera -> Renderização Tela 2D](/home/cerberus/.gemini/antigravity/brain/5fd7f7f5-b5e7-456e-9d0d-9eac36580b7a/schematic_matrix_pipeline_1772989922295.png)

A equação imperativa rainha disparada em cima cada pontinho individual ($V$) dentro do `@vertex shader` da WebGPU é estritamente:

$$ P_{TelaOutput} \  =  \ P_{MatrizProjetiva} \ \cdot \ V_{MatrizVisao} \ \cdot \ M_{MatrizModelo} \ \cdot \ \vec{v}_{PosicaoVec4} $$

1. **Matriz do Modelo ($M$):** Arrasta a malha local recém originada do `(0,0,0)` para as coordenadas absolutas do Grande Mundo Gigante (`World Space`).
2. **Matriz da Câmera ($V$):** Para criar visual de câmera, nós invertemos tudo! Se a Câmera andou 10 metros para a direita e girou pros lados... Nós giramos esse mundo gigantesco 10 metros puxando para a *esquerda* e aplicados o torque inverso em tudo. Para o hardware de vídeo, O Jogo rotaciona inteiro contra uma tela cega (`View Space`).
3. **Matriz de Projeção ($P$):** Esmaga a forma retangular de profundidade numa lente cônica com Field-of-view, cortando coisas distantes pela metade e forçando-as pra dentro do cubo de Renderização de Monitor normalizado (`Clip Space / NDC`). 

## O Encerramento: Multi-Instancing 

Com essa bagagem matemática dominada, o C++ não repete isso ativando chamadas pesadas por CPU para pintar uma Floresta.

Nós enlatamos as 50.000 **Matrizes do Modelo ($M$)** calculadas no Javascript de todas as árvores num Array `StorageBuffer` direto e inviolável na GPU.
Mandamos O Hardware desenhar O barril 50.000 cópias em pararelo com uma linha: `pass.drawIndexed(6, 50000)`.
O Vertex Shader da WebGPU rouba a Injeção `@builtin(instance_index)` e saca a Matriz isolada pra cada um dos processadores.
Resultado: Um milhão de triângulos, Matemática pesada TBN pra Luz Realista fluindo maciamente por segundo em telas comuns num mero navegador Edge ou Chrome usando WebAssembly puro.

[⬅ Voltar para Computação](./09_Compute_Pass_e_Queries.md) | [**Navegar para o Índice Temático** 🏠](./WEBGPU_STUDY.md)
