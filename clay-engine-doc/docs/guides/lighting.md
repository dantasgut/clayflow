---
sidebar_position: 19
title: Luzes
---

# Luzes — luz direta, sombras, ambiente e luz global (specs 011, 033 e 034)

A luz de uma cena vem de quatro fontes, cada uma um Resource independente:

| Fonte              | Resources                                         | O que dá                                                  |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| Luz direta         | `DirectionalLight`, `PointLight`, `SpotLight`, `RectLight` | a luz que chega em linha reta, com sombra na direcional; a de área (o painel, a janela) com o realce largo |
| Ambiente           | `HemisphereLight`, `EnvironmentMap`, `Sky`        | o céu e o chão em volta: o que os raios que escapam veem e o fundo visível |
| Luz rebatida       | `GlobalIllumination`                              | a luz que bate numa superfície e ilumina outra, e as cáusticas |
| Meios              | `FogVolume`                                       | névoa iluminada ([Iluminação global](./global_illumination.md)) |

O desenho não conhece nenhuma classe de luz: cada uma contribui aos pontos de cena (`scene_direct_lighting`,
`scene_environment`, `scene_background`…) e o shader é composto com o que está na cena. Inserir ou retirar uma luz
recompõe em transição, sem quadro quebrado ([Prontidão](./readiness.md)).

## Unidades físicas

As intensidades estão em unidades de fotometria: **lux** na direcional (a iluminância numa superfície voltada para
ela), **candela** na pontual e na spot, **nits** nas luminâncias (emissão, hemisfério). O sol ao meio-dia tem perto de
100 000 lux; a exposição da saída leva a cena à tela ([Apresentação](./presentation.md)).

## Luz direcional

```ts
import { DirectionalLight } from 'clayflow/web';

const sun = new DirectionalLight({
    direction: [-0.25, -1, -0.35, 0],
    color: [1, 1, 1, 1],
    intensity: 5,              // lux
    castShadow: true,
    angularRadius: 0.00466,    // rad: o disco do sol (0,267°)
});
app.world.insert(sun);

sun.data.direction = [-0.9, -0.1, 0, 0]; // quadro seguinte, sem recompilar
```

`angularRadius` (padrão 0: uma direção) é o raio do disco da luz. Ele dá:

- o **reflexo** da luz numa superfície quase lisa (a água, o vidro): o disco refletido, um brilho. Com 0, não há
  reflexo visível numa superfície lisa;
- a **penumbra de contato** das sombras (PCSS): estreita onde o objeto toca o chão, larga longe dele.

### Sombras: o mapa virtual

`castShadow: true` anexa à direcional um `ShadowMap` (`sun.shadowMap`). É um **mapa de sombra virtual**: níveis em
volta da câmera, cada um com o dobro do lado do anterior, divididos em páginas de 128² texels ancoradas no espaço da
luz. Só as páginas que a imagem usa existem. A profundidade da cena marca as páginas pedidas, e o estágio de sombra do
quadro seguinte desenha só as novas e as tocadas por quem se moveu; as outras seguem do quadro anterior. Tudo fica num
buffer (a tabela de páginas e as páginas), sem texturas.

```ts
new DirectionalLight({
    castShadow: true,
    shadow: {
        size: [2048, 2048],    // lado virtual de cada nível, em texels (sem ele, o do perfil do renderizador)
        firstLevelRadius: 1,   // meio lado do nível mais fino, em m; cada nível seguinte dobra
        penumbraSamples: 9,    // 1, 4 ou 9 (sem ele, o do perfil)
        bias: 1,               // viés de profundidade, em texels
        normalBias: 1.5,       // deslocamento pela normal, em texels (mais quanto mais rasante a luz)
    },
});
```

A **penumbra** é PCSS (Fernando, 2005): os bloqueadores são procurados em anéis que dobram de raio até a maior
penumbra possível; a meia largura da penumbra é a distância entre o receptor e a média dos bloqueadores vezes a
tangente do raio angular; o filtro PCF de 1, 4 ou 9 amostras cobre esse disco. A grade das amostras gira e se desloca
pela sequência do antisserrilhado temporal, e o acúmulo faz a média ([Antisserrilhado](./antialiasing.md)). Com
`angularRadius` 0, a penumbra é a do texel.

A resolução e as amostras vêm do perfil do renderizador (`renderer.shadows`); o que a autoria fixou no `shadow` vale
por cima ([Renderizador](./renderer.md)). A cena usa o mapa da primeira direcional que projeta sombra. Só a
direcional anexa mapa de sombra.

## Luz pontual e spot

```ts
import { PointLight, SpotLight } from 'clayflow/web';

app.world.insert(new PointLight({ position: [0, 2, 0, 1], intensity: 50, range: 10 })); // candela
app.world.insert(
    new SpotLight({
        position: [0, 3, 0, 1],
        direction: [0, -1, 0, 0],
        intensity: 200,
        range: 12,
        innerCone: Math.PI / 8,  // meio-ângulo da intensidade plena
        outerCone: Math.PI / 6,  // meio-ângulo além do qual não há luz
    }),
);
```

A queda é pelo inverso do quadrado, indo a zero suavemente até o alcance (`range`, padrão 10; 0 = sem alcance). Na
spot, a transição entre os cones é suave; cones fora de 0 < interno ≤ externo ≤ π/2 são presos, com aviso único.

## Luz de área (painel, janela)

```ts
import { RectLight } from 'clayflow/web';

app.world.insert(
    new RectLight({
        position: [-3, 4.5, 3, 1],   // o centro do painel
        direction: [0.5, -0.7, -0.5, 0], // a normal do lado que emite
        right: [1, 0, -1],           // a direção da largura (a parte perpendicular à normal é a que vale)
        size: [4, 1.8],              // largura × altura
        intensity: 7,                // luminância do painel, cd/m²
    }),
);
```

O painel emite só pelo lado da `direction`, com a mesma luminância em toda a área e em toda direção. No desenho, cada
lobo do material é **integrado sobre o retângulo, por pixel e sem sorteio**: o realce é a imagem do painel alargada pelo
lobo — nítida num cromado, uma mancha larga num verniz, uma mancha macia esticada através da escova num metal escovado
—, e o difuso recebe a irradiância do painel inteiro. Não há ruído (também no MSAA) nem estado entre quadros.

Como é calculado: o lobo especular parte o retângulo pelas células de uma grade polar das inclinações da micronormal
(5 anéis de massa conhecida da GGX por 8 raios, com os dois α no lobo anisotrópico); cada célula, refletida até o
plano da luz e recortada pelo retângulo, entra com a BSDF exata na direção do pedaço vezes o ângulo sólido dele. Os
lobos largos (difuso, subsuperfície, parede fina, sheen) usam 4 × 4 pontos de Gauss-Legendre. Erro contra a integral
densa: até 3 % da energia do lobo.

Limites: a luz de área **não projeta sombra**; o painel não aparece no quadro nem nos reflexos traçados (é luz, não
geometria); na luz rebatida, nos acertos dos raios e na névoa ela vale pelo centro (luminância × área × cosseno, pelo
inverso do quadrado); não atravessa os materiais com subsuperfície. O custo é fixo por pixel alcançado, por lobo
especular e por painel (40 células): use poucos painéis.

## Ambiente

### Hemisfério

Os estágios padrão inserem um `HemisphereLight` por cena (`app.defaults.ambient`): um céu e um chão de radiâncias
uniformes em volta do eixo `up`. O difuso recebe a irradiância exata do hemisfério na normal; os especulares, a
radiância na direção refletida. É uma aproximação, não luz rebatida.

```ts
const ambient = app.defaults.ambient;
ambient.data.intensity = 0.5;           // nits (padrão 0,3); skyColor, groundColor, up
ambient.background = true;              // o hemisfério também é o fundo visível
app.world.remove(ambient);              // sem ambiente: só as luzes diretas iluminam
```

`background` (padrão `false`) faz a câmera ver atrás da cena o mesmo céu e chão que a água e o vidro refletem e
refratam; sem ele, o fundo é a cor da limpeza (ou o `Sky`). O hemisfério também contribui ao ambiente dos raios que
escapam (`scene_environment`).

### Imagem do mundo

`EnvironmentMap` põe uma panorâmica equirretangular em volta da cena: o que a água, o vidro e os metais refletem, o que
os raios que escapam veem e, com `background` (padrão `true`), o fundo visível. O motor não lê arquivos: a aplicação
decodifica a imagem (HDR, PNG…) e passa a radiância linear.

```ts
import { EnvironmentMap } from 'clayflow/web';

app.world.insert(
    new EnvironmentMap({
        width: 2048,
        height: 1024,
        pixels,                  // Float32Array RGBA linear, linha a linha, a primeira linha no zênite
        intensity: 0.6,          // a escala da imagem na luz da cena
        yaw: 0,                  // giro em volta do eixo vertical (rad)
    }),
);
```

### Céu físico

`Sky` calcula a atmosfera (Rayleigh, Mie e ozônio) pela posição do sol, uma `DirectionalLight` da cena: o fundo, a
cor do sol ao longo do dia e a fonte dos raios que escapam. Detalhes em
[Iluminação global — Céu](./global_illumination.md#céu). Numa cena, um `Sky` ou um `EnvironmentMap`.

## Luz global

`GlobalIllumination` traz a luz rebatida por sondas (do mundo e de tela) e as cáusticas por fótons
([Iluminação global](./global_illumination.md)). Com ela na cena, os estágios padrão:

- desligam a luz ambiente constante do hemisfério (`ambient.lighting = false`): a luz que volta do céu e do chão é a das
  sondas, com a oclusão da cena. O hemisfério fica como o ambiente dos raios que escapam e o fundo;
- retiram o hemisfério se a cena tem o próprio ambiente (`Sky` ou `EnvironmentMap`), e o devolvem quando ele sai;
- inserem a `RayScene` que os raios consultam, se a cena não tem.

Retirada a GI, o hemisfério volta como estava. Os raios por sonda, as frações e os ladrilhos seguem o perfil do
renderizador, e o que a autoria fixou na `GlobalIllumination` vale por cima; `renderer.lightPaths.globalIllumination =
false` a desliga sem tirá-la da cena ([Renderizador](./renderer.md)).

Os raios das sondas, da refração e dos fótons sombreiam cada acerto pela onda dos acertos: o material e a luz direta
(com raio de sombra) num kernel próprio, fora do laço de traçado
([Renderizador — a onda dos acertos](./renderer.md#a-onda-dos-acertos-para-quem-traça-raios)).
