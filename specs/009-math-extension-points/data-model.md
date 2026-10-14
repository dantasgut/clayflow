# Data Model: Pontos de extensão matemáticos

## C2

| Entidade                   | Campos                                                                                                                                                 | Regras                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `WgslPoint`                | `name`, `fn` (nome da função), `params` (nome, tipo WGSL), `returns`, `ready: WgslModule`, `optional` (funções extras: derivadas, Jacobiana, projeção) | Imutável; `check(module)` valida nome, tipos e conflitos                                                                            |
| `bindPoints(entry, m)`     | módulo de entrada + mapa ponto → módulo do usuário                                                                                                     | Devolve módulo novo (`entry@impl…`), memorizado; árvore de `requires` com o pronto trocado; erro se o ponto não está na árvore      |
| `ExtensionFunction<P>`     | `point`, `code`, `params` (campo → `FieldType`), `values`                                                                                              | Schema gerado `Fn_<ponto>_<hash>`; módulo do usuário com o struct; registro no pool do schema; mudar `code` recompila, `values` não |
| `ComposedShader.ranges`    | módulo → [linha inicial, linha final]                                                                                                                  | Traduz a linha do compilador para a do código do usuário                                                                            |
| Evento `extensionRejected` | `point`, `resource`, `message`, `line`                                                                                                                 | Emitido uma vez por versão do código; o pipeline anterior (ou o pronto) continua                                                    |

## C1

| Entidade        | Campos                                                         | Regras                                                         |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `ShaderMessage` | `type` (`error`/`warning`/`info`), `message`, `line`, `column` | De `getCompilationInfo()`; reexportado como tipo pela C2       |
| `createAsync`   | —                                                              | Rejeita com a mensagem do device quando o pipeline não compila |

## C3

| Entidade                          | Campos / papel                                                                   | Regras                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `TransformFunction`               | ponto `transform`; por entidade                                                  | Entidades com a mesma função (mesmo módulo) formam um grupo; `Parent` compõe depois     |
| `CameraFunction`                  | ponto `camera` (+ `camera_project` opcional); por câmera                         | Câmera ativa com projeção define a variante do forward                                  |
| `FieldFunction`                   | ponto `field`; de cena                                                           | Somada a `field_accel` de todos os solvers                                              |
| `ForceFieldRecord`                | `kind`, `a`, `b` (vec4), `s` (vec4 de escalares)                                 | Um registro por campo pronto; laço no `field_accel`; gravidade uniforme fica fora       |
| `FieldBody`                       | `inv_mass`, `density`, `volume`                                                  | Preenchido por cada solver na chamada                                                   |
| `EmitFunction`                    | ponto `emit`; por emissor                                                        | Prontas: ponto, esfera, cone                                                            |
| `ComputeParticleEmitter`          | `rate`, `lifetime`, `maxParticles`, `seed`                                       | Anel na GPU; contagem viva = mín(taxa × vida, capacidade)                               |
| `ParametricSurface`               | `resolution [nu, nv]`, `domain [u0, u1, v0, v1]`, `closed [u, v]`, `animated`    | Grade e índices fixos; reavalia por tempo ou parâmetros; realoca só se a resolução muda |
| `SurfaceFunction`                 | ponto `surface` (+ `surface_du`/`surface_dv`)                                    | Prontas: plano, esfera, toro, terreno por ruído                                         |
| `SpaceFunction`                   | ponto `space` (+ `space_jacobian`); de cena                                      | Aplicada às `ParametricSurface`; ausente = identidade sem custo                         |
| `MaterialFunction`                | ponto `material`; por entidade                                                   | Entra na chave do pipeline do grupo de desenho                                          |
| `SurfaceSample` / `SurfaceParams` | `world_position, normal, uv, time` / `base_color, roughness, metallic, emissive` | Pronta: `albedo`, emissão 0                                                             |
