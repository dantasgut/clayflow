---
sidebar_position: 17
title: Iluminação global
---

# Iluminação global — céu, luz rebatida, cáusticas, névoa e fluidos por campo (spec 033)

A luz que bate numa superfície e ilumina outra (a parede vermelha que tinge o chão, o cômodo clareado pela janela, o
foco de luz sob uma esfera de vidro) entra na cena por três Resources independentes:

| Resource | O que faz |
|---|---|
| `Sky` | atmosfera física ligada a uma `DirectionalLight`: fundo da cena, cor do sol ao longo do dia, fonte dos raios que escapam |
| `GlobalIllumination` | luz rebatida por sondas (do mundo e de tela) e cáusticas por fótons; substitui o `HemisphereLight` |
| `FogVolume` | névoa, neblina ou fumaça iluminada pelo sol, pelo céu e pela luz rebatida |

Os materiais, os grafos de nós e o desenho da 011 não mudam: a luz indireta chega pelo ponto de cena `scene_lighting`.
Sem nenhum dos três, a cena é a da 011. Os fluidos com `FluidSurfaceMaterial` passam a ser uma superfície contínua por
campo de distância, sem mudança de autoria.

## Céu

```ts
import { DirectionalLight, Sky } from 'clayflow';

const sun = new DirectionalLight({ direction: [-0.3, -0.8, -0.5, 0], intensity: 1000, castShadow: true });
app.world.insert(sun);
app.world.insert(new Sky({ sun, turbidity: 1.5 }));

sun.data.direction = [-0.9, -0.1, 0, 0];   // o céu e a cor do sol acompanham no mesmo quadro, sem recompilar
```

- A direção e a iluminância (lux, fora da atmosfera) vêm da luz. O sol chega às superfícies atenuado pela atmosfera:
  branco ao meio-dia, alaranjado no horizonte.
- `turbidity` (aerossóis, 1 = limpo), `altitude` (km), `groundAlbedo`, `night` (piso de radiância noturna), `sunDisk`.
- Atmosfera de Hillaire (Rayleigh, Mie, ozônio, múltiplo espalhamento por tabela); tabelas refeitas só quando um
  parâmetro muda ou o sol anda. Erro máximo de 1,8 % contra a referência de CPU (smoke `sky`).

## Luz rebatida

```ts
import { GlobalIllumination } from 'clayflow';

const gi = new GlobalIllumination({ quality: 'medium', bounces: 3 });
app.world.insert(gi);                 // o HemisphereLight sai; removida a GI, ele volta
app.events.on('globalIlluminationReady', () => { /* kernels prontos: medir a partir daqui */ });

gi.data.bounces = 5;                  // quadro seguinte, sem recompilar
gi.quality = 'high';                  // aplica os raios, as frações e os fótons da qualidade
```

Como funciona:

- **Sondas de tela** (coleta final): uma sonda a cada ladrilho de pixels lança raios das superfícies visíveis pela
  estrutura de raios ([Estrutura de raios](./raytracing.md)). O primeiro rebatimento de perto (cantos, a sombra da luz
  rebatida) é exato.
- **Sondas do mundo**: 3 cascatas de 16 × 8 × 16 centradas na câmera, com irradiância e visibilidade octaédricas. Dão a
  luz fora da tela e os rebatimentos seguintes.
- Os acertos dos raios são sombreados com as funções `material` das entidades (grafos de nós incluídos), as luzes
  (amostradas pela potência, com raio de sombra), a emissão, o céu e o rebatimento do quadro anterior.
- O acúmulo no tempo tem histerese adaptativa por sonda: uma luz que acende chega a 98 % em 0,25 s, sem rastro.

| Opção | Padrão | Faixa |
|---|---|---|
| `quality` | `'medium'` | `'low'`, `'medium'`, `'high'` (raios e frações abaixo) |
| `bounces` | 3 | 1–8 |
| `raysPerProbe` | da qualidade (64) | 32, 64, 128, 256 |
| `probeFraction` | da qualidade (1/8) | (0, 1] |
| `hysteresis` | 0,97 | [0,8; 0,995] |
| `cascades` | 3 | 1–4 |
| `probeSpacing` | 1 m | espaçamento da cascata mais fina; as seguintes dobram |
| `screenGather`, `screenRays`, `screenTile`, `screenFraction` | ligada; da qualidade | coleta final na tela |
| `caustics`, `photons` | ligadas; da qualidade | cáusticas por fótons |
| `center` | acompanha a câmera | centro fixo do volume (um interior visto de fora) |

| Qualidade | Raios por sonda do mundo | Sondas do mundo por quadro | Fótons por quadro |
|---|---|---|---|
| `low` | 64 | 1/16 | 65 536 |
| `medium` | 64 | 1/8 | 262 144 |
| `high` | 256 | 1/2 | 1 048 576 |

### Espessura mínima de parede

As sondas do mundo ficam numa grade. Uma parede mais fina que cerca de metade de `probeSpacing` pode deixar vazar luz
fora da tela. Na tela a coleta é exata. Mantenha o espaçamento abaixo do dobro da parede mais fina que separa luz de
escuro. Medido: uma caixa de paredes de 5 cm sob sol forte tem dentro 0,079 % da luz de fora.

### Precisão (smoke `globalIllumination`, contra o traçador de caminhos da CPU)

- Cornell box: pior região ≤ 6,4 %.
- Cômodo com janela: ≤ 8,6 %.
- Ambiente branco fechado: a 0,4 % da série analítica.
- Convergência: em 2 s a 0,53 % do convergido.
- Cintilação com a câmera andando: ≤ 1,2 %.

### Cáusticas

Os fótons das luzes direcionais saem só sobre as instâncias que fazem cáustica: vidro ou metal liso, julgados pelo
material composto. Seguem os caminhos especulares e transmissivos até a primeira superfície difusa e se acumulam num
hash espacial. A esfera de vidro de IOR 1,5 foca a 0,9–1,0 da distância focal; o anel metálico desenha a cardioide. As
cáusticas da água continuam pela vista da luz, sem contar duas vezes.

## Névoa

```ts
import { FogVolume } from 'clayflow';

app.world.insert(new FogVolume({ shape: { box: [40, 8, 40] }, center: [0, 4, 0], density: 0.05, anisotropy: 0.5 }));

// Densidade por função (ponto `fog_density`) ou grafo de nós: × `extinction`.
app.world.insert(new FogVolume({
    shape: { sphere: 6 },
    density: { code: 'fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32 { return 0.5 + 0.5 * sin(p.x + time); }' },
    extinction: 0.2,
}));
```

Opções:

- `shape`: `{ box }` ou `{ sphere }`; `center`.
- `density`: constante (1/m), função, grafo ou grade `{ grid: { size, values } }` (que outro estágio pode escrever na
  GPU); com função, grafo ou grade, `extinction` dá a escala.
- `albedo`, `anisotropy` (Henyey-Greenstein), `emission`, `edge` (borda suave).

Como entra na cena:

- A névoa vive numa grade de 160 × 90 × 128 froxels alinhada à câmera.
- A sombra do sol recorta a névoa em feixes. O céu e a luz rebatida (com GI) também a iluminam.
- Atenua o que está atrás, inclusive através do vidro, e a luz que a atravessa, nas superfícies dentro dela e nos raios
  da GI.

Medido (smoke `fog`):

- Beer-Lambert a 0,14 %.
- Feixe pela janela a 1,9 % do traçador.
- Câmera andando: +0,05 ponto de cintilação.
- Custo: 0,55 ms a 1280 × 720.

## Fluidos por campo de distância

Corpos de partículas com `FluidSurfaceMaterial` viram um campo de distância com sinal, refeito na GPU a cada quadro
(blocos 8³ de ½ espaçamento, núcleos anisotrópicos, redistanciamento). A câmera, a sombra, as cáusticas e os raios da
GI enxergam a mesma superfície: lisa de perto, sem semicírculos nem favo de mel, com o volume a ±4,5 % das partículas.
Custo da água a 64 mil partículas: 2,3 ms (smoke `fluidField`).

## Orçamento

Na cena do bench `global-illumination` (1 milhão de triângulos animados, sol, céu, GI `medium`), a GI custa 3,7 ms por
quadro a 1280 × 720 (alvo ≤ 4 ms). O desenho tem passe de profundidade (`ForwardFlow`, opção `depthPrepass`, ligada por
padrão): a luz é calculada uma vez por pixel.

## Limites

- Paredes mais finas que ~½ `probeSpacing` podem vazar luz fora da tela.
- As faces de trás das listas de triângulos não são desenhadas nem rebatem.
- Nos acertos dos raios, as funções `material` que leem derivadas de tela valem pelas constantes.
- Acima do limite de binding de storage do dispositivo, a GI desliga e emite `globalIlluminationUnsupported`.
- Neste hardware (Apple), o tempo de GPU por passe não é confiável: medir pelo quadro inteiro ou por repetição.
