---
sidebar_position: 10
title: Physics Flows
---

# Physics Flows

A Clay Engine roda **toda a física na GPU** via compute shaders. Não há fallback CPU. Cada categoria de simulação é um `Flow` registrado por factory com o `bodyType` do seu pool; a Camada 2 o instancia quando o primeiro body do tipo entra na cena (ver [Flows](./flows.md)).

## Criando bodies — vocabulário de domínio (recomendado)

Há **três** classes de body — `RigidBody`, `SoftBody` e `FluidBody`. A forma recomendada de criá-los é o
**construtor de domínio**: você fala em massa, atrito, forma e algoritmo — o motor deriva o layout do struct
GPU (`pos.w`, `mat_props`, `body_shape`, `I_inv`) internamente, anexa o colisor coerente, e o **Flow do algoritmo
entra em cena sozinho** ao inserir o body. Mesmo padrão de `StandardMaterial`/`BoxGeometry`.

```typescript
import { RigidBody, SoftBody, FluidBody } from 'webgpu-engine';

// Corpo rígido dinâmico (LCP) — colisor + Transform anexados automaticamente
const ball = new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1, friction: 0.3, restitution: 0.45 });

// Soft body (XPBD): um corpo com N partículas em arrays (x, y, z por partícula); pos.w recebe invMass de mass
const rope = new SoftBody({ algorithm: 'XPBD', position: [0, 2, 0, 0, 1.8, 0], mass: [0, 1] });

// Fluido (SPH/PBF/MPM): um corpo com N partículas
const water = new FluidBody({ algorithm: 'SPH', position: blockOfPositions });
```

**Corpos de partículas são contêineres** (spec 008): `FluidBody` e `SoftBody` são **um** Resource com N partículas
numa faixa contígua do pool do algoritmo (a ordem das partículas é a dos arrays); `mass` e `velocity` vêm por partícula
ou como valor único. O estado é da simulação depois da inserção: para lê-lo na CPU,
`app.resources.read(corpo, 'body')` devolve o dado por campo. Um corpo removido libera a faixa inteira (os slots ficam
fora da simulação e da busca de vizinhança). SPH e PBF aceitam até `NEIGHBOR_SEARCH_MAX_PARTICLES` (65 536) partículas
por pool; acima disso, erro com o teto.

**Desenho.** Com `PointSpriteMaterial` na entidade, o corpo é desenhado como esferas pelo `ParticleFlow`, que lê as
posições direto do pool (sem cópia nem leitura de volta). Um `SoftBody({ surface: { triangles } })` vira malha: a
`SurfaceGeometry` dele é recalculada na GPU a cada quadro e desenhada com o material de superfície da entidade (e um
`Transform`), com sombra. Com `FluidSurfaceMaterial` (spec 017), o fluido vira água contínua — refração, absorção pela
espessura, reflexão com Fresnel e cáusticas sob a luz que projeta sombra — sem mudar a simulação. Para trocar o
material de um corpo vivo: `world.detach(corpo, materialAntigo)` e `world.attach(corpo, materialNovo)`.

O PBF calcula os substeps pelo passo estável do material (`ParticleMaterial.pbfStableDt`: a calibração de 5 cm a 60 Hz
escalada por (h / 0,1)²): 1 substep a 5 cm, 4 a 2,5 cm.

**Coesão, adesão e viscosidade (spec 030).** O comportamento do líquido é declarado no `ParticleMaterial` (um por cena):

| Campo       | Padrão | Efeito                                                                                                                            |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `cohesion`  | 0      | Tensão superficial de Akinci et al. 2013 (SPH e PBF): gotas arredondadas, jatos que se partem, borda que se fecha                 |
| `adhesion`  | 0      | Atração às fronteiras sólidas (limites do domínio e colliders plano/caixa/esfera): menisco, gota que gruda e escorre devagar      |
| `xsph`      | 0,05   | Suavização de velocidade XSPH do SPH e do PBF (antes uma constante dos solvers)                                                  |
| `viscosity` | 0,01   | Viscosidade dinâmica (Pa·s) — agora também no MPM fluido (tensão `J μ (C + Cᵀ)` pela matriz afim do APIC)                       |

`cohesion` e `adhesion` são adimensionais: 1 dá à partícula de borda (ou encostada na fronteira) uma aceleração da ordem
de g. As referências calibradas para água em cenas de 2–5 cm são `ParticleMaterial.WATER_COHESION` (3) e
`ParticleMaterial.WATER_ADHESION` (8). Com os dois em zero, nada muda: as trajetórias são as mesmas, bit a bit. Os
valores podem mudar em execução (`material.data.cohesion = …`), com efeito no passo seguinte. Coesão e adesão fortes
pedem mais substeps (oscilação 0,4 √(s / (valor · g))), até 4× os do solver; acima disso, são grampeadas com um aviso
único por material.

```typescript
app.world.insert(new ParticleMaterial({
    particleSpacing: 0.025,
    cohesion: ParticleMaterial.WATER_COHESION,
    adhesion: ParticleMaterial.WATER_ADHESION,
}));
```

Nenhum `schema`, `vec4` cru ou `flows.register` manual é necessário: os solvers padrão já estão registrados por
factory (`DEFAULT_SOLVER_REGISTRATIONS`, pelos defaults da `Application`) e, ao `world.insert(body)`, a C2 cria o
pool e instancia o Flow do algoritmo.

### Forma crua (avançado)

Para tuning de baixo nível, o construtor aceita `{ schema, data }` diretamente — controle total do struct,
sem derivações. Coexiste com a forma de domínio na mesma cena (produz o mesmo `Resource`):

```typescript
import { FluidBody, MPMFluidSchema } from 'webgpu-engine';
// count partículas, dado por campo do schema (fieldElements números por partícula)
const drop = new FluidBody({ schema: MPMFluidSchema, count: 1, data: { pos: [0, 0.5, 0, 0] } });
```

Os nomes de campo de cada schema (`pos`, `vel`, `F_col0…`) estão na definição do schema — veja a
[API Reference](/docs/api/README.md) e `src/elements/physics/bodies/schemas/`.

## Mapa Body → Schema → Flow

| Body class   | Schema (pool key)    | Flow registrado | Algoritmo                        |
|--------------|----------------------|-----------------|----------------------------------|
| `RigidBody`  | `LCPSchema`          | `LCPFlow`       | LCP solver + position projection |
| `SoftBody`   | `XPBDSoftSchema`     | `XPBDFlow`      | Position-Based Dynamics (XPBD)   |
| `SoftBody`   | `FEMSchema`          | `FEMFlow`       | FEM tetraedral co-rotacional     |
| `SoftBody`   | `MPMSoftSchema`      | `MPMFlow`       | Material Point Method (soft)     |
| `FluidBody`  | `SPHSchema`          | `SPHFlow`       | WCSPH                            |
| `FluidBody`  | `PBFSchema`          | `PBFFlow`       | Position-Based Fluids            |
| `FluidBody`  | `MPMFluidSchema`     | `MPMFlow`       | Material Point Method (snow)     |
| `DistanceConstraint` | `DistanceConstraint` | *(consumido por `XPBDFlow.constraintPoolKey`)* | Constraint XPBD escalar (`{ a: { body, index }, b }`; internas: `SoftBody({ edges })`) |

> A pool key default de cada flow corresponde ao schema homônimo (ex.: `MPMFlow.bodyType` default `'MPMFluidSchema'`). Para coexistir duas pools do mesmo algoritmo (ex.: MPM soft e MPM fluido no mesmo frame), use schemas distintos.

## Receita: corda com XPBD (arestas internas)

```typescript
import {
    Application, Camera, GravityField, SoftBody, DistanceConstraint, Transform, XPBDFlow, XPBDSoftSchema,
} from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(
    new Camera().add(new Transform({ position: [0, 1, 5, 1], rotation: Transform.lookRotation([0, 1, 5], [0, 1, 0]) })),
);
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));

// Substitui o XPBDFlow padrão apenas para tunar solverIters/substeps (sem isto, o padrão
// é instanciado com defaults quando o primeiro SoftBody XPBD entra na cena).
app.flows.override(
    XPBDSoftSchema.name,
    (ctx) => new XPBDFlow(ctx, { constraintPoolKey: 'DistanceConstraint', solverIters: 4 }),
    { type: 'XPBDTuned', phase: 'physics' },
);

// Um corpo: 10 partículas em coluna (mass 0 ⇒ fixa) e 9 arestas internas entre consecutivas (índices locais).
const N = 10;
const REST = 0.2;
const links = Array.from({ length: N - 1 }, (_, i) => i);
const rope = new SoftBody({
    algorithm: 'XPBD',
    position: Array.from({ length: N }, (_, i) => [0, 2 - i * REST, 0]).flat(),
    mass: Array.from({ length: N }, (_, i) => (i === 0 ? 0 : 1)),
    edges: { a: links, b: links.map((i) => i + 1), restLength: links.map(() => REST), compliance: 0 },
});
app.world.insert(rope);
// Restrição entre corpos (mesmo pool): partículas por { body, index } — a C2 resolve o slot.
const other = new SoftBody({ algorithm: 'XPBD', position: [0.3, 2, 0], mass: 1 });
app.world.insert(other);
app.world.insert(new DistanceConstraint({ a: { body: rope, index: N - 1 }, b: { body: other, index: 0 }, restLength: 0.3 }));
app.start();
```

## Receita: snow material com MPM

```typescript
import { Application, FluidBody, GravityField, ParticleMaterial, PointSpriteMaterial } from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));

// A grade do MPM vem do material das partículas (slot opcional do MPMFlow): domínio e
// espaçamento definem origem, células por eixo e aresta da célula (2 × espaçamento).
app.world.insert(new ParticleMaterial({
    particleSpacing: 0.05,
    domainMin: [-1.6, -1.6, -1.6],
    domainMax: [1.6, 1.6, 1.6],
}));

// Esfera de 200 partículas num corpo (FluidBody 'MPM' → pool roteia ao MPMFlow)
const position: number[] = [];
for (let i = 0; i < 200; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 0.3 * Math.cbrt(Math.random());
    position.push(r * Math.sin(phi) * Math.cos(theta), 0.5 + r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}
app.world.insert(new FluidBody({ algorithm: 'MPM', position }).add(new PointSpriteMaterial({ radius: 0.025 })));
app.start();
```

## Corpos rígidos: broadphase e pose na GPU

- **Broadphase**: o `LCPFlow` testa só pares candidatos — uma grade hash espacial em GPU (proxies uma vez por passo,
  pares por substep com a velocidade do substep) alimenta a narrowphase de caixa/esfera por despacho indireto; planos
  seguem exaustivos. `new LCPFlow(ctx, { maxPairsPerBody })` (padrão 64) limita a lista de pares por corpo e forma;
  excedente é contado e avisado, nunca perdido em silêncio. O conjunto de contatos é o mesmo da varredura exaustiva.
- **Pose na GPU**: o LCP publica posição e rotação de cada corpo direto no pool `Transform` (o conjunto declara
  `owns`) — nenhuma leitura de volta por quadro. Mutar o `Transform` de um corpo dinâmico é ignorado com aviso; para
  ver a pose na CPU, leia sob demanda:

```typescript
const pose = await app.resources.read(ball.attached.find((p) => p instanceof Transform)!);
console.log(pose?.position); // a do último quadro enviado
const poses = await app.resources.readAll(transforms); // um lote: uma cópia por faixa contígua e uma leitura
```

## Campos de força e emissores (spec 009)

Todo solver (rígido, XPBD, FEM, MPM, SPH, PBF) e todo emissor somam, a cada passo, a gravidade uniforme do
`GravityField` e os **campos da cena** pelo ponto `field`: os prontos — `GravityField` com fonte pontual
(`sourceMode: 1`, atração G·M/r²), `WindField` (direção × intensidade, rajadas pela turbulência), `VortexField`
(giro em torno do eixo, decaindo com a distância), `DragField` (−(linear + quadrático·|v|)·v), `BuoyancyField`
(abaixo do nível, g·ρ_meio/ρ_corpo para cima, nos corpos com densidade: fluidos de partículas e MPM) — e as
`FieldFunction` do usuário (`fn field_fn(x, v, time, body, data) -> vec3f`). Os campos são acelerações (m/s²); o rígido
recebe o campo no centro de massa, sem torque. Sem campos na cena, as trajetórias são as de antes, bit a bit.

```ts
app.world.insert(new WindField({ direction: [1, 0, 0, 0], magnitude: 2, turbulence: 0.3 }));
app.world.insert(
    new FieldFunction({
        params: { radius: 'f32', k: 'f32' },
        values: { radius: 1, k: 6 },
        code: /* wgsl */ `
fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    let d = vec3f(x.x, 0.0, x.z);
    let r = max(length(d), 1e-4);
    return -d / r * (r - data.radius) * data.k;   // atrai para um anel
}`,
    }),
);
```

`ComputeParticleEmitter` roda inteiro na GPU (`EmitterFlow`): `rate` partículas por segundo contadas por passo da
física, vida `lifetime`, anel de `maxParticles`; a criação é a forma (`PointEmitterShape`, `SphereEmitterShape`,
`ConeEmitterShape`) ou uma `EmitFunction` (`fn emit_fn(i, time, seed, data) -> EmittedParticle`, com `emit_rand`); as
partículas integram gravidade e campos e são desenhadas pela `PointCloudGeometry` da entidade (`maxPoints =
maxParticles`) com um material de pontos.

## Superfícies colidíveis (spec 010)

Uma `ParametricSurface` com `SurfaceCollider` vira colisor para todos os solvers e emissores: corpos rígidos (contato
por canto da caixa ou no centro da esfera, atrito e restituição do corpo), SPH, PBF e MPM (empurrão para fora e
adesão da 030), XPBD, FEM e emissores (que antes não colidiam com nada; agora colidem com todos os colliders). O campo
é construído na GPU a partir da mesma função que desenha a superfície, com o espaço da cena e a transformação da
entidade:

- `mode: 'height'` (padrão) — terreno: altura sobre o plano xz local (fora da área do terreno, nada colide; dobras
  ficam com a altura máxima);
- `mode: 'distance'` — superfície geral (toro, esfera, tubo): distância com sinal numa grade 3D em volta da
  superfície, dentro = lado oposto ao da normal.

```ts
const terrain = new ParametricSurface({ preset: 'terrain', resolution: [128, 128] });
app.world.insert(terrain.add(new SurfaceCollider({ mode: 'height' })).add(new StandardMaterial()).add(new Transform()));
const torus = new ParametricSurface({ preset: 'torus', params: [0.6, 0.25] });
app.world.insert(torus.add(new SurfaceCollider({ mode: 'distance', resolution: 64 })).add(new StandardMaterial()).add(new Transform()));
```

Superfície que anima (`animated`, espaço na cena ou `TransformFunction`) tem uma cópia do campo por passo fixo do
quadro: a mesma trajetória a 30, 60 e 144 Hz. Limites: `Transform` animado por função entra com um quadro de atraso;
escala não uniforme aproxima a distância pela menor escala; até 16 superfícies colidíveis por estágio; corpos mais
rápidos que a espessura da grade podem atravessar, como com paredes finas. A folga (`margin`) é 0 por padrão — uma
folga maior que a dos contatos entre corpos desestabiliza pilhas.

Fluidos sobre terreno ou superfícies abertas usam o domínio aberto do material, sem paredes:
`new ParticleMaterial({ bounds: 'open', domainMin, domainMax })` — a caixa do domínio só limita o cálculo (a grade de
vizinhos); o fluido colide só com os colliders da cena, e a partícula que sai da caixa por baixo ou pelos lados é
retirada. O padrão (`'walls'`) mantém o chão e as paredes do domínio, com adesão.

## Busca de vizinhança (SPH, PBF)

Reconstruída a cada substep: célula de cada partícula viva, soma de prefixos, espalhamento, ordenação por índice dentro
de cada célula (com as posições copiadas na mesma ordem) e busca em 9 faixas de células contíguas numa ordem fixa,
gravando a lista intercalada (`k * stride + i`). A lista é determinística (trajetórias bit a bit entre execuções e nas
taxas de 30/60/144 Hz) sem vetor local por partícula. Com 64 000 partículas SPH, o bench `particles/64k` roda a 74 fps
(13 ms de GPU por quadro, desenho incluído).

## Convenções dos Flows

- **Slots, não consultas**: cada solver declara os seus slots (`slot.bodies()`, `slot.singleton(Time.schema)`, pools
  opcionais de restrições e colliders…); a C2 os resolve e entrega ao `dispatch(frame, bound)` — contagem, buffer e
  slot de cada entidade, sempre atuais.
- **Bind groups da C2**: layouts inferidos do WGSL e bind groups criados pela C2 (privados por nome + `consumes`).
  Quando um pool dobra de capacidade, a C2 recria os grupos afetados (`bindGroupReplaced`) antes da próxima gravação;
  o solver só religa os seus recursos privados que dependem do tamanho (numa transição, com `ctx.bind`).
- **Parâmetros fora da gravação**: uniforms por passo são escritos em `framePrepare`; o `dispatch` só grava.
- **Remoção**: a C2 libera os slots dos pools e entrega `slotChanged`/`poolReallocated` quando aplicável; a posse da
  GPU do slot é devolvida.
- **Uniforms por iteração**: `PerStepUniforms` (`elements/gpu/compute`) dá uma região por passo/substep com offset
  dinâmico.
- **Substituição**: `app.flows.override(bodyType, factory, opções)` troca o solver de um tipo de corpo.

---

> **Veja também:** os pipelines internos de cada flow em
> [Pipeline XPBD](./pipeline_xpbd.md), [Pipeline LCP](./pipeline_lcp.md),
> [Pipeline FEM](./pipeline_fem.md) e [Pipeline MPM](./pipeline_mpm.md);
> a comparação de abordagens de soft body em [SoftBody](./SoftBody.md).
