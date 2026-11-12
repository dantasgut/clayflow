---
sidebar_position: 21
title: Refração
---

# Refração física — vidro, água e todo transmissivo por raio traçado (spec 034)

O que se vê através de um vidro, de uma lente ou da água vem de raios traçados na estrutura de raios da cena
([Estrutura de raios](./raytracing.md)), nunca de uma cópia da tela nem de uma imagem pronta. Cada pixel cuja primeira
superfície é uma interface transmissiva refaz o raio da câmera e segue o caminho pela cadeia de interfaces: Fresnel
exato, reflexão interna total, rugosidade pela distribuição GGX das normais visíveis, absorção de Beer–Lambert no meio
e dispersão por canal em cada interface.

A refração de cada objeto é do **material** dele (o grafo de nós); o renderizador guarda só os limites do traçado
([Renderizador](./renderer.md)). Não há Resource de refração para criar: o `Refraction` e o `Caustics` são mantidos
pelo `Renderer` da cena.

## Um vidro pelo grafo de materiais

Um transmissivo é uma entidade desenhada com `StandardMaterial` e uma `MaterialFunction` cujo grafo devolve um
fechamento com o lobo de transmissão (`nodes.bsdf.transmission`). O especular do dielétrico (`nodes.bsdf.dielectric`)
dá a reflexão na interface; a transmissão, o que atravessa.

```ts
import {
    MaterialFunction,
    NodeGraph,
    SphereGeometry,
    StandardMaterial,
    Transform,
    nodes,
} from 'clayflow/web';

const glass = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            reflect: nodes.bsdf.dielectric.with({ ior: 1.5, roughness: 0 }),
            transmit: nodes.bsdf.transmission.with({
                ior: 1.5,
                color: [0.9, 0.97, 0.95], // a cor atingida a `depth` de percurso
                depth: 0.1,               // m; 0 = sem absorção
                abbe: 0,                  // sem dispersão
                roughness: 0,
            }),
            surface: nodes.closure.add,
            out: nodes.output.closure,
        },
        links: [
            ['reflect.value', 'surface.a'],
            ['transmit.value', 'surface.b'],
            ['surface.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});

app.world.insert(
    new SphereGeometry({ radius: 0.5 })
        .add(new Transform({ position: [0, 0.5, 0, 1] }))
        .add(new StandardMaterial())
        .add(glass),
);

glass.values.transmit_ior = 1.33; // `nó_parâmetro`: quadro seguinte, sem recompilar
```

Ao entrar a primeira função `material` com lobo de transmissão, opacidade ou translucidez, os estágios padrão inserem
a `RayScene` (se a cena não tem) e as cáusticas do renderizador. Nada mais é preciso para o vidro aparecer.

O sub-grafo OpenPBR (`nodes.material.openpbr`) traz a mesma transmissão com os nomes da norma:
`transmission_weight`, `transmission_color`, `transmission_depth`, `transmission_abbe`, `specular_ior`,
`specular_roughness` e `geometry_thin_walled` ([Materiais](./materials.md)).

### Os parâmetros da transmissão

| Entrada     | Padrão | Significado                                                                                     |
| ----------- | ------ | ----------------------------------------------------------------------------------------------- |
| `ior`       | 1,5    | índice de refração (a linha d do espectro); abaixo de 1 vale 1                                  |
| `color`     | branco | a cor que a luz tem depois de `depth` de percurso no meio (Beer–Lambert, por canal)             |
| `depth`     | 0      | o percurso em que a cor é atingida; 0 desliga a absorção                                        |
| `abbe`      | 0      | número de Abbe da dispersão; 0 desliga; valores positivos abaixo de 10 valem 10                 |
| `roughness` | 0      | rugosidade da interface (borra o que se vê através), em [0, 1]                                  |

A absorção vira um coeficiente por canal, σ = −ln(cor) / `depth`, aplicado ao percurso dentro do meio. A água, com a
absorção por metro (0,45; 0,09; 0,06), é `color = exp(−absorção)` com `depth = 1`.

### Dispersão pelo número de Abbe

Com `abbe` > 0 o meio separa os canais. O índice de cada canal sai do índice da linha d e do número de Abbe V:

n(canal) = n_d + (n_d − 1) / V · k, com k = −½ no vermelho (linha C), 0 no verde (linha d) e +½ no azul (linha F).

Um vidro crown tem V ≈ 60; um flint denso, V ≈ 20 (a cena `dispersao` do app usa 20). O caminho de um meio dispersivo
segue cada canal separado a partir da interface; sem dispersão, os três seguem juntos.

### Prioridade do meio e parede fina

Dois nós de fechamento completam a cadeia:

- `nodes.closure.mediumPriority` (`priority`): na sobreposição de volumes transmissivos — o vidro mergulhado na água
  —, o de maior prioridade vale dentro dele, e a borda do outro que passa por dentro não é interface. No empate, vale o
  último em que o raio entrou.
- `nodes.closure.thinWalled`: a placa de espessura zero (vidraça, bolha). A luz atravessa sem desviar e reflete com
  as reflexões múltiplas entre as faces (2R / (1 + R)); absorção e rugosidade da transmissão não valem nela.

## Os limites do traçado: `lightPaths`

```ts
const r = app.defaults.renderer;
r.lightPaths.refraction = true;  // a refração traçada ligada (padrão)
r.lightPaths.transmission = 8;   // interfaces cruzadas por caminho, 1–32
r.tracing.checkerboard = false;  // metade dos blocos 2×2 por quadro, em xadrez
```

- `lightPaths.transmission` vem do perfil (16 no alto, 4 no médio e no baixo) e o ajuste feito depois vale por cima.
  No limite, a energia que resta conta como absorvida. Com 3, o caminho vidro → água → vidro não fecha; por isso o
  perfil baixo fica em 4.
- A pilha de meios de um caminho tem até 4 meios (`REFRACTION_MAX_MEDIA`); um meio além disso conta a energia como no
  limite de interfaces.
- `lightPaths.refraction = false`: os transmissivos usam só a reflexão traçada e a opacidade.
- `tracing.checkerboard` (ligado no médio e no baixo): parado, cada pixel recebe o valor exato a cada 8 quadros e o
  filtro temporal guarda o histórico; em movimento, o bloco não traçado é reconstruído dos vizinhos traçados.

Mudar qualquer valor vale no quadro seguinte, sem recompilar.

## A cadeia de interfaces no quadro

Os estágios padrão fazem a refração na fase `forward`, depois dos opacos:

1. **Pedido** — o `ForwardFlow` desenha os transmissivos (as duas faces, com profundidade própria, à frente dos opacos)
   e marca os pixels cuja primeira superfície é uma interface: a distância e se ela é uma face de trás (a câmera dentro
   do meio). O `RefractionVolumeRequestFlow` faz o mesmo para a superfície dos volumes (a água das partículas); com a
   câmera dentro de um volume, todo pixel é pedido até a saída dele ou até o opaco.
2. **Traçado** — o `RefractionFlow` compacta os pixels pedidos numa fila (despacho indireto) e refaz o raio da câmera
   de cada um, com o mesmo deslocamento da amostra dentro do pixel. O material dos acertos é avaliado fora do laço de
   traçado, na onda dos acertos ([Renderizador — a onda dos acertos](./renderer.md#a-onda-dos-acertos-para-quem-traça-raios)).
   Ele escreve a radiância (a transmitida mais a refletida na primeira interface), o ponto que o pixel mostra e o
   albedo dele.
3. **Filtro** — o `RefractionDenoiseFlow` filtra o sinal traçado no tempo (`TemporalFilter`,
   `renderer.temporalFilter`), guiado pelo albedo: casas de albedo diferente não se misturam.
4. **Composição** — o `RefractionCompositeFlow` escreve a radiância (filtrada, quando houver) e a profundidade da
   primeira interface nos pixels pedidos, com a névoa até ela. Não lê a cor da cena: o que está atrás vem só do raio.
5. **Movimento** — o `RefractionMotionFlow` dá os vetores de movimento do que a refração mostra, para o antisserrilhado
   temporal ([Antisserrilhado](./antialiasing.md)).

O raster só escolhe os pixels: o valor traçado é o do raio do pixel, também na borda.

## O que se vê atrás

O raio que sai da cena vê o ambiente: o `Sky`, o `EnvironmentMap` ou o hemisfério da cena
([Luzes](./lighting.md)). Para a câmera ver atrás da cena o mesmo céu e chão que a água e o vidro refletem e refratam,
ligue o hemisfério como fundo:

```ts
app.defaults.ambient.background = true;
```

A luz que passa pelo transmissivo chega às superfícies difusas pelas cáusticas (fótons pela estrutura de raios;
`renderer.caustics`, [Renderizador — Cáusticas](./renderer.md#cáusticas)).

## A água como corpo de fluido

A água é um `FluidBody` com uma `MaterialFunction` transmissiva: a superfície é contínua, por campo de distância
(`FluidField`, spec 033), e entra no pedido da refração pelo `RefractionVolumeRequestFlow`. A composição é a do vidro,
com a névoa, o movimento e o filtro do mesmo caminho.

```ts
import { FluidBody, GravityField, ParticlePhysics } from 'clayflow/web';

const spacing = 0.02;
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.world.insert(new ParticlePhysics({ ...ParticlePhysics.WATER, particleSpacing: spacing }));

const water = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            reflect: nodes.bsdf.dielectric.with({ ior: 1.333, roughness: 0.02 }),
            transmit: nodes.bsdf.transmission.with({
                ior: 1.333,
                color: [0.45, 0.09, 0.06].map((a) => Math.exp(-a)), // absorção por metro
                depth: 1,
            }),
            surface: nodes.closure.add,
            out: nodes.output.closure,
        },
        links: [
            ['reflect.value', 'surface.a'],
            ['transmit.value', 'surface.b'],
            ['surface.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});

app.world.insert(new FluidBody({ algorithm: 'PBF', position }).add(water)); // `position`: x, y, z por partícula
```

As ondas da água são as da simulação. Ondulações procedurais na normal (`nodes.surface.ripple` ligado a
`nodes.closure.normal`) servem a uma lâmina parada; numa água que se move, um relevo fixo por cima a deixaria fosca.
Na mesma cena, vidro e água se resolvem pela prioridade do meio.

## Quando a estrutura de raios não cabe

Se a `RayScene` não cabe no dispositivo, a cena recebe `raySceneUnsupported` e, com um transmissivo e a refração
ligada, `refractionUnsupported` (uma vez, com o motivo). Sem `RayScene`, o estágio da refração não traça.

```ts
app.events.on('refractionUnsupported', (e) => console.warn('refração indisponível:', e.reason));
```

## Medidas

O smoke `refraction` compara o motor com o traçador de caminhos da CPU (a mesma cena, com a pilha de meios e a
dispersão), na integral do pixel (modo `accumulate`). O custo da lente por perfil está em
`specs/039-tracado-em-ondas/baseline.md`.
