# Contrato: tensão superficial e adesão nos solvers de partículas

## Autoria (API pública)

```ts
const material = new ParticleMaterial({
  particleSpacing: 0.025,
  cohesion: ParticleMaterial.WATER_COHESION, // padrão 0
  adhesion: ParticleMaterial.WATER_ADHESION, // padrão 0
  xsph: 0.05, // padrão 0.05
  viscosity: 0.01, // agora também no MPM fluido
});
world.insert(material);
material.data.cohesion = 0.6; // em execução: vale no passo seguinte
```

Erros: `RangeError` nomeando o campo para valor negativo ou não finito.

## Garantias

1. `cohesion = 0`, `adhesion = 0`, `xsph = 0.05`: trajetórias SPH/PBF idênticas bit a bit às anteriores à 030.
2. Coesão/adesão > 0: mesma trajetória a 30/60/144 Hz; sem leitura de volta; sem NaN com partículas isoladas ou
   coincidentes.
3. Passo: substeps crescem pela restrição capilar até 4× os base; acima, valor efetivo grampeado e
   `console.warn` único por material.
4. Adesão age a distância < H (suporte da vizinhança) de toda fronteira tratada pela colisão do solver: planos do
   domínio (`domainMin`) e colliders plano/caixa/esfera do `ColliderSet`; não aplica reação nos corpos rígidos.
5. Fronteiras futuras (015/016) entram implementando `ColliderHit` (distância com sinal + normal) — a adesão não muda.

## Ordem dos passes

- SPH: densidade → **normais** (se coesão > 0) → pressão → forças (**+ coesão/curvatura**) → integração → colisão
  (**+ adesão**).
- PBF: predição (**+ adesão**) → (λ → correção → aplicação → colisão)×N → velocidade → vorticidade (**+ ρ, normais**)
  → XSPH (**+ coesão/curvatura**) → aplicação.
- MPM: P2G com **tensão viscosa** no fluido.
