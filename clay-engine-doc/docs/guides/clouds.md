---
sidebar_position: 23
title: Nuvens volumétricas
---

# Nuvens volumétricas — a camada de nuvens e a perspectiva aérea (spec 041)

Uma `CloudLayer` põe no céu físico (`Sky`) uma camada de nuvens desenhada pela transferência radiativa: extinção,
espalhamento e transmitância ao longo do raio da câmera, com autossombra, espalhamento múltiplo e a fase de Mie das
gotículas. Nenhuma imagem de nuvem entra no lugar do cálculo: os volumes de ruído, os mapas e as tabelas são escritos
por kernels na GPU a partir de grafos de nós.

Com o `Sky` sozinho, sem `CloudLayer`, toda a geometria da cena já recebe a **perspectiva aérea**: a luz espalhada e a
transmitância da atmosfera entre a câmera e cada superfície (o morro a 10 km esmaece e azula; a parede a 10 m quase não
muda).

```ts
import { Application, CloudLayer, DirectionalLight, Sky } from 'clayflow';

const app = await Application.create({ canvas });
const sun = new DirectionalLight({ direction: [-0.3, -0.6, -0.7], intensity: 100_000 });
app.world.insert(sun);
app.world.insert(new Sky({ sun }));
app.world.insert(new CloudLayer({ base: 1500, top: 4000, coverage: 0.45, type: 0.5, wind: [8, 2] }));
await app.whenReady();
```

## A camada

| Valor | Unidade | Padrão | O que é |
|---|---|---|---|
| `base`, `top` | m acima do chão da cena (y = 0) | 1500, 4000 | as altitudes da camada (a casca sobre o planeta do `Sky`) |
| `coverage` | [0, 1] ou função | 0,5 | a fração do céu coberta (medida na imagem vista de cima: 20 % pede 20 % da área) |
| `type` | [0, 1] | 0,5 | 0 estrato (fino e liso), 0,5 cúmulo (couve-flor), 1 cúmulo-nimbo (até o topo); contínuo |
| `density` | 1/m | 0,04 | a extinção na densidade 1 |
| `albedo` | [0, 1] | 0,99 | o albedo de espalhamento |
| `dropletDiameter` | µm (5–50) | 20 | o diâmetro das gotículas: a fase de Mie aproximada (Jendersie & d'Eon 2023) |
| `wind` | m/s, [x, z] | [5, 0] | o vento: as nuvens andam com ele e se deformam (o detalhe deriva para cima, o topo adiantado) |
| `shape` | grafo ou WGSL | o Perlin-Worley da biblioteca | a forma (o volume de ruído periódico) |
| `shapeScale`, `detailScale` | m | 12000, 1800 | metros por período dos volumes de forma e de detalhe |

Mudar valores vale no quadro seguinte sem recompilar; mudar a forma refaz os volumes na GPU. Valores fora do intervalo
lançam `RangeError` nomeando o valor.

### Cobertura por grafo ou WGSL

A cobertura pode ser uma função do ponto horizontal (no referencial que anda com o vento) e do tempo simulado — o mapa de
tempo das nuvens. A função devolve a cobertura local, o tipo e a densidade relativa:

```ts
new CloudLayer({
    coverage: {
        code: /* wgsl */ `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f {
    let front = smoothstep(-2000.0, 2000.0, xz.x - 5.0 * time);
    return vec3f(0.9 * front, 0.5, 1.0);
}`,
    },
});
```

Por grafo, a saída é um `vec3f` (por exemplo, `math.combine3` dos nós de ruído e de mapeamento). A forma (`shape`) segue o
ponto `cloud_shape`: `fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f`, com `p` em [0, 1)³ — R a forma base e G/B/A a
erosão em três frequências. Os ruídos do grafo de forma devem usar o parâmetro `period` (os nós de ruído o têm): o
volume se repete pelo céu e, sem período, a costura aparece (há aviso).

## Como a luz entra

- **Autossombra**: um cone curto de passos até o sol e, além dele, o mapa de transmitância visto do sol (a profundidade
  ótica acumulada em quartos do trecho da camada ao longo do sol).
- **Espalhamento múltiplo**: oitavas (Wrenninge 2013) com coeficientes calibrados contra um traçador de referência com
  rastreamento delta; a fase de Jendersie & d'Eon dá o brilho prateado contra o sol.
- **Ambiente**: o céu por cima e o chão iluminado por baixo, integrados da vista do céu a cada quadro.
- **Atmosfera**: a nuvem esmaece pela perspectiva aérea até a profundidade dela, a mesma da geometria.

## Na cena

- **Sombra**: a transmitância das nuvens até o sol entra no ponto `light_transmission` (só para a luz do sol do `Sky`):
  o chão, a água, os objetos, a névoa e as sondas da iluminação global recebem a sombra, que anda com o vento.
- **Céu dos raios que escapam**: um panorama das nuvens visto da câmera entra no ponto novo `sky_cover`, que o `Sky` lê no
  ambiente — a refração, o reflexo na água e as sondas veem as nuvens, e a luz ambiente cai com o encoberto.
- **Composição**: a perspectiva aérea e as nuvens entram na tela depois da água e atrás da névoa dos froxels
  (`SkyCompositeFlow`), recortadas pela profundidade das superfícies.

## Custo por perfil

A marcha roda em ¼ da resolução, um pixel de cada bloco 2 × 2 por quadro, e a reconstrução temporal (série da spec 037)
completa os outros, reprojetados pela posição da nuvem e pelo vento. Medido no Apple M4 a 1280 × 720 (o tempo do quadro
com nuvens menos o do mesmo céu sem a camada; a GPU dividida com o navegador oscila):

| Perfil | Passos (luz) | Panorama | Mapa visto do sol | Custo |
|---|---|---|---|---|
| alto | 96 (6) | 256 × 128 | 384², 32 km | 2,3–2,8 ms |
| médio | 64 (5) | 192 × 96 | 256², 16 km | 0,8–1,6 ms |
| baixo | 48 (4) | 128 × 64 | 256², 16 km | 0,6 ms (picos de 2,4 ms na primeira cena da rodada) |

Sem `CloudLayer`, nenhum estágio das nuvens prepara pipeline nem aloca alvo: custo zero.

## Limites conhecidos

- O espalhamento múltiplo por oitavas fica a 31,9 % (média) do transporte completo numa nuvem espessa vista de baixo — o
  limite do modelo; a imagem do motor fica a ≤ 4 % do mesmo modelo calculado em f64.
- Uma camada por cena; só a luz do sol do `Sky` ilumina as nuvens.
