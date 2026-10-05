# Quickstart — Transformações reativas

## Posicionar objetos

```ts
import {
  Application,
  BoxGeometry,
  StandardMaterial,
  Transform,
  Camera,
  DirectionalLight,
} from 'webgpu-engine';

const app = await Application.create({ canvas });
// … câmera e luz como no README …

const cube = new BoxGeometry({ size: [1, 1, 1] })
  .add(new StandardMaterial({ albedo: [0.85, 0.4, 0.25, 1] }))
  .add(
    new Transform({
      position: [5, 0, 0, 1],
      rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)], // 45° em Y
      scale: [2, 1, 1, 1],
    }),
  );
app.world.insert(cube);
app.start();
```

O cubo aparece em x = 5, girado 45° e esticado em X — com sombra e iluminação coerentes.

## Animar sem chamadas extras

```ts
const t = cube.attached.find((p) => p instanceof Transform) as Transform;
app.events.on('frameTick', ({ elapsed }) => {
  t.data.position[1] = Math.sin(elapsed); // reflete no quadro seguinte
});
```

## Migração (`model` removido)

Antes: `new Transform({ model: minhaMatriz })`. Agora: forneça `position`, `rotation` e `scale`. Fornecer `model` emite
um aviso e é ignorado. Para transformações que não cabem em TRS, aguarde o ponto de extensão `transform` (F3) — ou
registre um Flow próprio na fase `transform`.

## Física

Corpos rígidos continuam movendo seus objetos; a escala visual que você define no `Transform` é preservada. Alterar o
`data` de um corpo físico depois de inserido é ignorado (a simulação é dona do estado) e gera um aviso.

## Validação desta feature

- `npm test` — testes de proxy, fila, política de envio, slots, fases, `TransformFlow`, forward/sombra.
- Smoke: `cp src/__smokes__/transforms.ts src/main.ts && npm run dev` → `TRANSFORMS SMOKE PASSED` (readback do pool
  `WorldTransform` = oráculo; pixels nos centros projetados; mutação no quadro seguinte; escala preservada na física).
- Smokes existentes (`integration`, `multiApp`, `stress60s`) e exemplos do README sem regressão.
- Gate completo: lint → format → madge → knip → tsc → test:coverage → doc:coverage → build:lib.
