# Quickstart: nuvens volumétricas (spec 041)

## Uma cena com nuvens

```ts
import { Application, CloudLayer, DirectionalLight, Sky } from 'clayflow';

const app = await Application.create({ canvas });
const sun = new DirectionalLight({ direction: [-0.3, -0.6, -0.7], intensity: 100_000 });
app.world.insert(sun);
app.world.insert(new Sky({ sun }));
app.world.insert(
  new CloudLayer({
    base: 1500,
    top: 4000,
    coverage: 0.45,
    type: 0.5, // cúmulos
    wind: [8, 2],
  }),
);
await app.whenReady();
```

Céu encoberto de estratos: `coverage: 1, type: 0, base: 600, top: 1400`. Cobertura desenhada por um grafo:
`coverage: { graph }` com um grafo cuja saída `vec3f` é (cobertura, tipo, densidade) pela posição `xz` e pelo tempo.

## Verificar

```bash
npm run smoke -- clouds --headless --timeout 400         # contra o traçador de referência
npm run smoke -- clouds --dist --headless --timeout 400  # pelo pacote montado
npm run smoke -- antialiasing,sky,fog,globalIllumination,refraction,limits --headless --timeout 600
npm run bench:check                                      # cenas clouds/* e as existentes
npm run ci
```

O smoke `clouds` mede, contra a referência f64: transmitância e radiância por região (SC-001), brilho de borda contra o
sol (SC-002), cobertura (SC-003), sombra no chão (SC-004), tempo de GPU por passe (SC-005) e cintilação/rastro com
câmera e vento (SC-006). Imagens de referência em `src/__smokes__/fixtures/clouds-*`.

## Vídeos (claflow-web, porta 5184)

Cenas `nuvens` (meio dia), `pordosol`, `voo` (do chão até acima da camada) e `sombrasnuvens` (terreno e água):

```bash
npm run video -- nuvens,pordosol,voo,sombrasnuvens
```
