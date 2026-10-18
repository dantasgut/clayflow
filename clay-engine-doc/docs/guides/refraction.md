---
sidebar_position: 18
title: Refração
---

# Refração — vidro e água pelo raio refratado (spec 034)

O que se vê através de um material com transmissão (vidro, líquidos, parede fina) e através da água é o **raio
refratado traçado por pixel pela cena**, pela [estrutura de raios](./raytracing.md). O fundo refratado fica nítido em
qualquer ampliação (uma esfera de vidro como lente não mostra pixels nem degraus) e mostra o que está fora da tela ou
encoberto por outro objeto.

## Ligando

Nada a ligar: com o primeiro material com transmissão (ou um `FluidSurfaceMaterial`) na cena, os estágios padrão
inserem a `RayScene` e alocam as texturas do traçado; com o último, retiram. A `Refraction` da cena fica em
`app.defaults.refraction` e é ajustável:

```ts
app.defaults.refraction.data.maxInterfaces = 8; // interfaces seguidas antes de ler a cópia da cena
app.defaults.refraction.data.antialias = 1; // antisserrilhado da imagem refratada (padrão ligado)
app.defaults.refraction.data.roughnessBlur = 1; // desfoque da rugosidade (padrão ligado)
```

## O material

A transmissão vem da função `material` (spec 011): um dielétrico na face e a transmissão por dentro.

```wgsl
return closure_add(
    closure_dielectric(ior, vec3f(1.0), roughness, 0.0, vec3f(0.0)),
    closure_transmission(ior, color, depth, abbe, roughness),
);
```

- `ior`: índice de refração; `abbe`: número de Abbe (0 = sem dispersão).
- `color` e `depth`: a cor atingida a `depth` metros de percurso dentro do material (Beer-Lambert pela distância real
  percorrida pelo raio; `depth` 0 = sem absorção).
- `roughness`: a rugosidade borra o que se vê (o cone da rugosidade sobre a imagem traçada).
- `closure_translucent(color)`: parede fina — a luz atravessa sem desvio.

A água (`FluidSurfaceMaterial`) refrata pelo mesmo traçado: `ior`, `abbe`, `absorption` (por metro) e `refraction`
(0,05 = o desvio físico; 0 = sem desvio).

## Como funciona

1. **Pedidos.** As faces da frente dos materiais com transmissão (e a superfície da água) gravam, por pixel, a normal,
   o IOR, o Abbe, a absorção, a rugosidade e a distância da câmera.
2. **Caminho.** O raio refratado segue pela cena: entra no objeto, acha a face de saída (a própria geometria está na
   estrutura), refrata ou reflete totalmente (Fresnel exato), encadeia os vidros e a água seguintes, absorve em cada
   meio, até a primeira superfície que não transmite. No limite de interfaces, lê a cópia da cena (Catmull-Rom) onde
   a próxima superfície aparece.
3. **Luz.** A superfície vista é sombreada pelo mesmo material e pela mesma luz do desenho (`ray_hit_closure` e
   `scene_lighting`: luzes, sombras, luz rebatida, cáusticas).
4. **Antisserrilhado.** Onde a imagem refratada muda de um pixel para o vizinho (bordas, padrões finos vistos pela
   lente), três raios a mais dentro do pixel; onde ela é lisa, um raio basta.
5. **Dispersão adaptativa.** O raio do centro é o do verde, com a separação estimada entre o vermelho e o azul onde ele
   termina (a lei de Snell derivada pelo IOR ao longo do caminho). Onde essa separação passa de ¼ de pixel e a imagem
   muda dentro do deslocamento de cada canal, o pixel traça os três canais; onde não aparece, o raio do verde basta.
6. **Composição.** O vidro compõe a radiância transmitida do próprio pixel com o reflexo da face (Fresnel), a opacidade
   e a névoa; a água, com o espalhamento e as cáusticas.

## Custo (Apple M4, 1280 × 720)

| Cena | Tempo de GPU |
|---|---|
| Vidro num quarto da tela, cômodo iluminado atrás | 2,4 ms (1,3 ms sem o antisserrilhado) |
| Pior caso: lente sobre xadrez emissivo fino (bordas em toda a lente) | 2,9 ms |
| Barragem de 36 864 partículas com água, cáusticas, antisserrilhado e dispersão (o quadro inteiro) | 16,0 ms |

Critério (princípio dos limiares da spec 034): a refração cabe em ≤ 15 % do quadro a 60 Hz no hardware de referência
mais fraco; sem transmissão na cena, nada é alocado nem traçado.

## Limites

- A superfície iluminada vista com dispersão é a do raio do verde nos pixels que traçam os três canais com
  antisserrilhado (a emissão, o fundo e os reflexos seguem por canal).
- O reflexo nas faces atravessadas é o do ambiente (céu e sondas), não um raio refletido traçado.
- Funções `material` que leem derivadas de tela (`dpdx`, `fwidth`) valem pelas constantes nos acertos (H6).
- Os kernels usam até 10 buffers de armazenamento por estágio; o traçado tem dois kernels por amostra (o caminho e a
  luz) para caber.

## Smoke

`npm run smoke -- refraction` confere a lente ampliando ≥ 8× sem degraus, a cor por região contra um traçador na CPU
(esfera, bloco com absorção, copo d'água, vidros encadeados, dispersão), o que está fora do quadro e encoberto, a parede
fina, a rugosidade e o custo.
