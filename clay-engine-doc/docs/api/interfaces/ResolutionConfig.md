[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / ResolutionConfig

# Interface: ResolutionConfig

Defined in: [scene/systems/resolution/ResolutionConfig.ts:19](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L19)

Configuração do sistema de resolução de colisões.

Parâmetros físicos são compartilhados entre todos os tipos de resolver.
Parâmetros específicos de cada tipo são ignorados pelos demais.

## Example

```ts
const world = new PhysicsWorld({
  resolution: {
    type:         ResolutionType.SEQUENTIAL_IMPULSE,
    iterations:   10,
    warmStarting: true,
    friction:     0.6,
  },
});
```

## Properties

### angularCorrectionScale?

> `optional` **angularCorrectionScale?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:60](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L60)

Escala a correção angular da constraint de posição XPBD (0–1).
0 = sem correção angular (corpos tombam livremente — recomendado).
1 = XPBD padrão (torque restaurador forte, pode impedir tombamento).
Default: 0.

***

### baumgarteFactor?

> `optional` **baumgarteFactor?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:35](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L35)

Fator de Baumgarte — fração da penetração corrigida por substep (0–1).
Default: 0.4.

***

### compliance?

> `optional` **compliance?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:52](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L52)

Compliance da constraint de contato (m/N — inverso da rigidez).
α = 0 → rígido (padrão); α > 0 → suaviza a correção por substep,
limitando Δpos = depth / (wSum + α/dt²) e prevenindo explosões
de velocidade angular em corpos alongados (bastão, placa).
Valores típicos: 1e-6 (quase rígido) a 1e-3 (notavelmente elástico).
Default: 0. Ignorado por IMPULSE e SEQUENTIAL_IMPULSE.

***

### friction?

> `optional` **friction?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:30](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L30)

Coeficiente de atrito de Coulomb (μ). Default: 0.5.

***

### frictionAnchorBeta?

> `optional` **frictionAnchorBeta?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:96](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L96)

Fator de restauração do Friction Anchor (0–1).
Controla com que intensidade o anchor puxa o objeto de volta à posição
original de contato. Valores altos (> 0.5) podem causar vibração.
Default: 0.2. Ignorado se frictionAnchors = false.

***

### frictionAnchors?

> `optional` **frictionAnchors?**: `boolean`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:89](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L89)

Habilita Friction Anchors — armazena o ponto de contato inicial e aplica
uma velocidade de restauração para prevenir drift em superfícies inclinadas.
Default: false. Ignorado por IMPULSE e PBD.

***

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:69](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L69)

Número de iterações PGS por substep.
Valores maiores convergem melhor para pilhas, mas custam mais.
Default: 10. Ignorado por IMPULSE e PBD.

***

### overRelaxation?

> `optional` **overRelaxation?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:83](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L83)

Fator de sobre-relaxação do PGS (ω). Range recomendado: [1.0, 1.5].
Valores > 1 aceleram a convergência para pilhas de objetos, reduzindo
o número de iterações necessárias. Valores > 1.5 podem causar
instabilidade em cenas densas. Default: 1.0 (sem sobre-relaxação).
Ignorado por IMPULSE e PBD.

***

### penetrationSlop?

> `optional` **penetrationSlop?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:40](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L40)

Penetração mínima (m) antes de aplicar correção de posição.
Default: 0.005 (5 mm).

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:26](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L26)

Coeficiente de restituição global. Default: 0.3.

***

### restitutionThreshold?

> `optional` **restitutionThreshold?**: `number`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:28](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L28)

Velocidade relativa mínima (m/s) para aplicar restituição. Default: 1.0.

***

### type?

> `optional` **type?**: [`ResolutionType`](../enumerations/ResolutionType.md)

Defined in: [scene/systems/resolution/ResolutionConfig.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L21)

Método de resolução. Default: IMPULSE.

***

### warmStarting?

> `optional` **warmStarting?**: `boolean`

Defined in: [scene/systems/resolution/ResolutionConfig.ts:75](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/scene/systems/resolution/ResolutionConfig.ts#L75)

Reutiliza os impulsos acumulados do frame anterior como ponto de partida.
Reduz iterações necessárias para convergência em contatos persistentes.
Default: true. Ignorado por IMPULSE e PBD.
