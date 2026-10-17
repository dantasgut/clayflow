# Data Model — 033 Iluminação global

## Resources novos e alterados

| Entidade                    | Camada | Dados (domínio)                                                                                                | GPU                                                                                                                                                       |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RayScene` (novo)           | C3     | nenhum (gerado da cena)                                                                                        | BLAS por conteúdo de geometria (nós, primitivas ordenadas, caixas), TLAS (nós, instâncias), contadores; recurso de cena do módulo `ray_scene`             |
| `Sky` (novo)                | C3     | `sun` (a `DirectionalLight`), raio do planeta, altitude, densidades de Rayleigh/Mie/ozônio, intensidade do sol | tabelas `rgba16float` (transmitância 256×64, múltiplo espalhamento 32×32, vista do céu 192×108) e uniform; contribuição a `light_transmission` (o sol)    |
| `GlobalIllumination` (novo) | C3     | `enabled`, `quality`, `bounces`, `raysPerProbe`, `probeFraction`, `photons`, `hysteresis`, `cascades`          | sondas (irradiância e visibilidade octaédricas, estado, deslocamento), radiância especular por sonda, hash das cáusticas; contribuição a `scene_lighting` |
| `HemisphereLight` (011)     | C3     | inalterado                                                                                                     | retirado pelos estágios padrão enquanto há `GlobalIllumination`                                                                                           |
| `FrameTargets` (011)        | C4     | inalterado                                                                                                     | o céu desenha nele depois dos opacos                                                                                                                      |

## Estruturas

- `RayHit` — distância (∞ sem acerto), instância, primitiva, baricêntricas, ponto, normal, slot do registro `Renderable`.
- `BvhNode` — caixa (min, max), filhos ou intervalo de primitivas, pai (refit).
- `RayInstance` — matriz de mundo e inversa, BLAS, registro `Renderable`.
- `ProbeState` — deslocamento, estado (ativa, desligada, dentro), contador de quadros.
- `PhotonCell` — chave do hash, irradiância acumulada (ponto fixo), quadro.

## Estados e transições

- BLAS: `pending` → `built` (LBVH) → a cada produção da geometria no quadro: `refit`; topologia nova: `rebuild`.
- TLAS: reconstruída a cada quadro em que há instâncias.
- Sonda: `new` → (classificação) `active` | `inside` (desligada) → relocada a cada atualização.
- `Sky`: tabelas regeneradas quando os parâmetros mudam ou o sol se move além do limiar.
- `GlobalIllumination` inserida → `HemisphereLight` retirado; removida → devolvido.

## Validação

- `bounces` em 1–8; `raysPerProbe` em {32, 64, 128, 256}; `probeFraction` em (0, 1]; `hysteresis` em [0,8; 0,995].
- Dispositivo sem os limites (R10): `GlobalIllumination` desligada com aviso `globalIlluminationUnsupported`.
