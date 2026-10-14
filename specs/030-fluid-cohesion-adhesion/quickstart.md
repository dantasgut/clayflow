# Quickstart: coesão e adesão

```ts
import { Application, FluidBody, FluidSurfaceMaterial, ParticleMaterial } from 'clayflow';

const app = await Application.create({ canvas });
const material = new ParticleMaterial({
  particleSpacing: 0.025,
  cohesion: ParticleMaterial.WATER_COHESION, // tensão superficial (padrão 0)
  adhesion: ParticleMaterial.WATER_ADHESION, // molha as fronteiras (padrão 0)
});
app.world.insert(material);
app.world.insert(new FluidBody({ algorithm: 'SPH', position }).add(new FluidSurfaceMaterial()));
app.start();

// Em execução: vale a partir do passo seguinte.
material.data.adhesion = 0; // superfície que repele
```

- Líquido mais "grosso" sem mudar a superfície: aumentar `viscosity` (SPH, PBF e, agora, MPM fluido).
- Menos amortecimento visual: reduzir `xsph` (padrão 0,05).

## Verificação

```sh
npm run smoke -- fluidBehavior            # medidas e fixtures por caso (R9)
npm run smoke -- fluidBehavior --dist
npm run smoke -- particles trajectories fluidSurface   # idênticos, exceto MPM fluido (regravadas, R7)
npm run bench -- --scene particles --variant 64k-cohesion --engine clayflow
npm run bench:check
```
