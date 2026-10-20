# Contrato — refração, antisserrilhado e prontidão (034)

## Autoria (sem mudança para materiais existentes)

- Vidro, água e qualquer transmissivo continuam definidos pelo `Closure` devolvido pela função `material`
  (`closure_transmission(ior, color, depth, abbe, roughness)`, `closure_dielectric`, nós `bsdf`). Nenhum parâmetro novo
  é exigido; a refração passa a ser traçada automaticamente.
- `FluidSurfaceMaterial`: `refraction` obsoleto (aviso único, ignorado); `roughness` novo.
- `Application.create({ antialias })`: `'temporal'` (padrão), `'msaa'`, `'off'`; `true` ≡ `'temporal'`,
  `false` ≡ `'off'`.
- `Camera.cut()`: descarta históricos (antisserrilhado, GI de tela, névoa) no próximo quadro.

## Prontidão

```ts
await app.whenReady({ timeoutMs: 30_000 }); // rejeita com Error listando os pipelines pendentes
app.events.on('engineReady', (e) => …);
app.events.on('enginePreparing', (e) => …);   // e.pending: { flow, pipeline }[]
app.events.on('consumerMissing', (e) => …);   // e.flow, e.name — uma vez por par
```

`app.step(dt)` nunca é bloqueado pela prontidão; quem mede ou grava espera `whenReady`.

## Marcações e tempos de GPU

```ts
app.events.on('gpuFrameTimed', (e) => …); // e.gpuFrame, e.totalMs, e.phasesMs, e.flowsMs, e.passesMs — uma vez por quadro
```

C3/C4 nomeiam os passes (`frame.compute('gi.trace', …)`); fase e Flow vêm da C2 automaticamente. Capturas externas
mostram `forward/ForwardFlow/transmissionFront`.

## Pontos de cena e módulos (C3)

- `ray_hit_material(hit: RayHit) -> Closure` — material composto nos acertos (único; GI, fótons e refração).
- `ray_hit_sample(hit, cone) -> SurfaceSample` — com `footprint` e derivadas de uv pelo cone.
- A refração é consumidora da estrutura de raios (`requires: [rayScene]`) e da luz da cena (`scene_lighting`,
  `light_visibility`); não importa nada da GI.

## Saídas por pixel

- `refraction_radiance`, `refraction_reflection` (rgba16f): lidas pela composição dos transmissivos e da água no próprio
  pixel; nenhuma leitura de `scene_copy`.
- `motion` (rg16f, pixels): posição anterior − atual; escrito pelo prepass e pelos passes que desenham sem prepass
  (sprites, água).

## Ferramenta de vídeo

```text
npm run video -- <cena>[,<cena>…] [--frames N] [--out pasta] [--lossless] [--hdr10] [--timeout s]
```

Saída `<cena>.mp4` (H.264 High 4:2:0 CRF 12, 60 FPS), opcional `<cena>-lossless.mkv` (FFV1) e `<cena>-hdr10.mp4`
(HEVC Main10, `hvc1`). Código de saída 0 ok, 1 falha de cena, 3 ambiente (sem ffmpeg, sem WebGPU).
