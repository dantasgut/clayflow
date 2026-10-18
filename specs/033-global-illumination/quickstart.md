# Quickstart: iluminação global

```ts
import {
  Application,
  DirectionalLight,
  GlobalIllumination,
  Sky,
  BoxGeometry,
  PlaneGeometry,
  StandardMaterial,
  Transform,
} from 'clayflow';

const app = await Application.create({ canvas });
const sun = new DirectionalLight({
  direction: [0.4, -0.5, 0.3],
  intensity: 100000,
  castShadow: true,
});
app.world.insert(sun);
app.world.insert(new Sky({ sun }));
app.world.insert(new GlobalIllumination({ quality: 'medium' }));
app.defaults.presentation.data.exposure = -12;

// Um cômodo com uma janela: as paredes onde o sol não bate recebem a luz rebatida.
```

Verificação: `npm run smoke -- rayScene,sky,globalIllumination --headless` (medidas no relatório, inclusive a Cornell box
contra o traçado de caminhos da CPU).
