---
sidebar_position: 16
title: Estrutura de raios
---

# Estrutura de raios — "o que este raio atinge?" na GPU (spec 033)

A **estrutura de raios** responde, num shader, qual é a primeira superfície que um raio atinge, e se algo bloqueia um
segmento. É um recurso da cena (`RayScene`) mantido na GPU pelo `RaySceneFlow` a cada quadro, sem leitura de volta.
Quem consulta não conhece a origem da geometria: malhas, superfícies paramétricas, geometria de grafos de nós, corpos
moles e partículas respondem pela mesma função. Consumidores: a iluminação global (sondas, coleta na tela, fótons) e a
refração (spec 034), que recalcula o que se vê através do vidro e da água pelo raio refratado.

## Ligando

Com uma `GlobalIllumination` na cena, os estágios padrão inserem a `RayScene` sozinhos. Para usar os raios sem a GI,
insira-a:

```ts
import { RayScene } from 'clayflow';

app.world.insert(new RayScene());
```

Sem `RayScene` o `RaySceneFlow` fica pendente e não custa nada.

## O que entra

| Origem | Como entra | Atualização |
|---|---|---|
| Malhas indexadas (`BoxGeometry`, `SphereGeometry`, carregadas…) | triângulos, uma hierarquia por conteúdo (`contentKey`): mil caixas iguais = uma hierarquia de baixo | construída uma vez |
| Geometria escrita na GPU (`ParametricSurface`, corpos moles) | triângulos | reajuste das caixas nos quadros em que o produtor marca `produced('vertices')` |
| Geometria com contagem só na GPU (`GraphGeometry`, malha adaptativa) | triângulos; os além da contagem do registro indireto ficam vazios | reconstruída quando produzida |
| Corpos de partículas com `PointSpriteMaterial` | esferas do raio do material, na posição do pool do corpo; a cor do sprite é o albedo | reajuste a cada quadro, topologia nova a cada 8 |
| Corpos com `FluidSurfaceMaterial` (água) | volume, pelo campo de distância (`FluidField`) — ver [Volumes](#volumes) | campo refeito a cada quadro |

Nuvens de pontos e arames não são superfícies e ficam de fora. A hierarquia de cima (uma folha por instância, com a
matriz de mundo lida do pool `WorldTransform` na GPU) é reajustada a cada quadro e refeita a cada 8 ou quando o conjunto
muda.

## Consultando (WGSL)

O módulo `rayScene` declara os recursos de que precisa; um pipeline que o requer recebe a estrutura sem ligar nada à mão.

```wgsl
struct RayHit {
    t: f32,            // distância (RAY_MISS = sem acerto)
    instance: u32,     // instância atingida (NONE = sem acerto)
    primitive: u32,    // triângulo ou esfera na hierarquia
    renderable: u32,   // registro `Renderable` do desenho (NONE nas esferas dos sprites)
    bary: vec2f,       // baricêntricas no triângulo
    face: f32,         // 1 = lado de fora da face geométrica, −1 = de dentro
    position: vec3f,   // ponto em mundo
    normal: vec3f,     // normal interpolada em mundo
    uv: vec2f,
}
fn ray_scene_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayHit
fn ray_scene_occluded(origin: vec3f, dir: vec3f, t_max: f32) -> bool
```

`dir` é unitária; `t_max` limita o segmento. `ray_scene_occluded` para no primeiro acerto (sombras, visibilidade) e
é mais barata que `ray_scene_hit`.

Um estágio de consulta completo (o do smoke `rayScene`):

```ts
import { rayScene, rayVolumeHitReady, wgslModule } from 'clayflow';

const query = wgslModule({
    name: 'my_ray_query',
    requires: [rayScene, rayVolumeHitReady, raysResource, hitsResource],
    source: /* wgsl */ `
@compute @workgroup_size(64)
fn my_ray_query_main(@builtin(global_invocation_id) gid: vec3u) {
    let o = rays[gid.x * 2u].xyz;
    let d = rays[gid.x * 2u + 1u].xyz;
    let h = ray_scene_hit(o, d, 1e30);                 // superfícies
    let v = ray_volume_hit(o, d, min(h.t, 1e6));       // volumes antes delas
    if (v.hit) { hits[gid.x] = vec4f(v.position, v.t); return; }
    hits[gid.x] = vec4f(h.position, h.t);
}`,
});
```

O estágio é um `Flow` com `slot.singleton(RayScene.schema)` (fica pendente sem a estrutura), registrado numa fase
depois de `transform` (o `RaySceneFlow` roda em `transform`, depois dos estágios que escrevem geometria).

### Material nos acertos

Cada instância guarda o material copiado do registro da entidade: as constantes do `StandardMaterial` (albedo,
rugosidade, metal; cinza médio fosco sem ele), o slot da função `material`, ou a cor constante do sprite. Quem sombreia
os acertos lê isso da instância, sem ligar os pools de material. As funções `material` das entidades são compostas
num `switch` por quem sombreia (a `RayScene` publica a lista em `materialFunctions` e sobe `materialRevision` quando
muda); as que leem derivadas de tela (`dpdx`, `fwidth`) ficam de fora — nos acertos valem as constantes.

## Volumes

Superfícies opacas ficam na estrutura; volumes que o raio atravessa entram por dois **pontos de cena** que qualquer
recurso pode preencher:

```wgsl
struct RayVolumeHit { t: f32, position: vec3f, normal: vec3f, material: u32, hit: bool, inside: bool }
fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit        // o cruzamento mais próximo
fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f   // a luz que atravessa o segmento
```

Quem já sabe de que lado do volume está (a refração, pela pilha dos meios atravessados) usa as variantes sem o teste do
lado da origem, e o meio do volume atingido:

```wgsl
fn ray_volume_enter(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit   // origem fora: a entrada mais próxima
fn ray_volume_exit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit    // origem dentro: a saída
struct RayVolumeMedium { ior: f32, abbe: f32, absorption: vec3f }           // absorção por metro, por canal
fn ray_volume_medium(material: u32) -> RayVolumeMedium
```

O shader requer os prontos (`rayVolumeHitReady`, `rayVolumeTransmittanceReady`, `rayVolumeEnterReady`,
`rayVolumeExitReady`, `rayVolumeMediumReady`: nenhum volume, transmitância 1, água sem absorção) e a C2 troca pela
composição dos contribuintes da cena: o `FluidField` (a água: cruzamento pela marcha no campo e absorção
dentro dela) e os `Froxels` (a névoa: transmitância). Um volume novo é um Resource com `getSceneContributions()`; quem
consulta não muda.

## Raios curvos

O contrato é por segmento: `origin`, `dir` e `t_max`. Um raio curvo (espaço não euclidiano, lente gravitacional,
refração contínua num meio de índice variável) é uma poligonal: integre o raio no seu espaço e consulte cada trecho com
`t_max` = comprimento dele, parando no primeiro acerto. A estrutura não supõe que o raio seja reto entre consultas.

## Custo (Apple M-series, 1280 × 720)

| Trabalho | Tempo |
|---|---|
| Construção de 1 milhão de triângulos | 8,6 ms (uma vez, ou quando a topologia muda) |
| Reajuste de 1 milhão de triângulos escritos na GPU | ≤ 1 ms por quadro |
| Hierarquia de cima de 10 mil instâncias que se movem | 0,26 ms por quadro (média) |
| Esferas de um corpo de sprites | reajuste por quadro; a construção a cada 8 ordena as partículas |

Folhas de 8 triângulos vizinhos (em ordem de Morton) seguram a memória e o reajuste; as esferas e as instâncias têm
uma por folha.

## Limites

- Pilha de 32 na travessia e no máximo 4096 nós visitados por raio (salvaguarda para uma hierarquia ainda
  incompleta no quadro em que a geometria entra).
- Geometria escrita na GPU entra depois da primeira produção.
- Acima do limite de binding de storage do dispositivo, o estágio desliga e emite `globalIlluminationUnsupported` com
  o motivo.
- Nos acertos, o material é o das constantes e das funções `material` sem derivadas de tela; texturas amostradas por
  derivada valem só no desenho.
- Esferas dos sprites não têm `Renderable` (`renderable = NONE`) nem matriz: já estão em mundo.

## Material no acerto

`ray_hit_closure(hit, time)` (módulo `rayHit`) devolve o fechamento da superfície atingida — o mesmo do desenho: as
constantes do material da instância e as funções `material` da cena, compostas no ponto `ray_hit_material` por quem
traça (`composeHitMaterial` + `bindPoints`). Não depende da GI: a refração e as sondas recebem o mesmo módulo. Ele lê
só as instâncias, então um kernel que sombreia um acerto gravado por outro não precisa da travessia.

## Refração (spec 034)

O vidro e a água refratam pela estrutura: cada pixel com transmissão grava um pedido (normal, IOR, Abbe, absorção,
rugosidade), e o raio refratado segue pela cena — entra e sai dos objetos, reflete totalmente, encadeia vidros e a água
(`ray_volume_enter`/`ray_volume_exit` com o meio de `ray_volume_medium`), absorve pela distância em cada meio — até a
primeira superfície que não transmite, sombreada por `ray_hit_closure` e `scene_lighting`. O que está fora da tela ou
encoberto aparece; a lente amplia sem degraus. Ver o guia de materiais (transmissão) para o uso e os parâmetros
(`Refraction`).

## Smoke

`npm run smoke -- rayScene` confere:

- a estrutura lida de volta;
- os acertos contra a interseção analítica (≤ 1 % do tamanho);
- o reajuste da superfície e a instância que se move;
- os tempos de 1 milhão de triângulos e de 10 mil instâncias;
- o contrato (`contract`): malha, superfície, grafo, sprites e água consultados pelo mesmo kernel.
