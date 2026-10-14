# Research: Pontos de extensão matemáticos

Levantamento na `develop` após o PR #43 (CI verde). Achados A, decisões R.

## Achados

- **A1 Composição**: `composeWgsl` (`scene/shaders/composeWgsl.ts`) inclui módulos por identidade, em pós-ordem; um
  símbolo em dois módulos é `symbol-conflict`; o resultado é memorizado por módulo de entrada (`WeakMap`). Não há troca
  de função: só outro módulo de entrada com outro `requires`.
- **A2 Transform**: TRS isolado em `fn transform_local(t: Transform) -> WorldTransform` (`transform_local.wgsl`),
  exigido por `transform_compose` e `transform_link` (`elements/scene/flows/shaders.ts`). `TransformParams` só tem
  `count` — sem tempo.
- **A3 Camera**: `math/camera.wgsl` tem perspectiva, ortográfica, view e lookAt isolados; o seletor e a
  `viewProjection` ficam no kernel `camera_compose`. O forward projeta com `cameras[slot].viewProjection * world`
  (`forward.wgsl:vs_main`). Controllers (Orbit/Fps/Fly) só mudam o `Transform` na CPU.
- **A4 Surface**: `ParametricGeometry`/`ParametricSurfaceGeometry` amostram uma função JS na CPU com normais
  `[0,1,0]`. Geometria em compute só para corpos moles (`SurfaceGeometry` escrita pelo `SoftSurfaceFlow`). Há `noise`
  na `wgslLib`.
- **A5 Space**: nada.
- **A6 Field**: cada solver lê `GravityField` como singleton opcional na CPU (padrão `[0, -9.81, 0]`) e copia para o
  uniforme dos seus parâmetros; a conta `v += g·dt` está inline em `predict`, `fem_predict`, `pbf_predict`,
  `sph_forces`, `mpm_grid_update`, `rb_predict`. `sourceMode` é ignorado. `WindField`, `VortexField`, `DragField`,
  `BuoyancyField` declaram um uniforme cada e ninguém os lê.
- **A7 Material**: `fs_main` faz Lambert + ambiente + sombra PCF + cáusticas com `material.albedo`; `roughness` e
  `metallic` não são usados; o `uv` não chega ao fragmento. O material declara o pipeline (`pipeline_standard`) e o
  `ForwardFlow` agrupa os desenhos por id de pipeline.
- **A8 Emit**: `ComputeParticleEmitter` declara um pool `ComputeParticle` (position, velocity, ageAndLife, params) e
  ninguém o consome. Formas ponto/esfera/cone amostram na CPU (`sample(rng)`). Partículas de corpos são desenhadas
  como `PointCloudGeometry` escrita por kernels `*_vertex_write` + `PointSpriteMaterial`.
- **A9 Compilação**: `EngineCore.createAsync` compila pipelines em segundo plano; `PipelineState` usa quando
  `preferAsync`. Nenhum caminho lê `getCompilationInfo()` nem trata rejeição: um WGSL inválido vira erro de validação
  do device (escopo não capturado).
- **A10 Troca em execução**: `FlowRuntime.prepare` é idempotente por id; trocar shader exige `release(id)` +
  `prepare`. `World.attach/detach` emite `entitiesRecomposed`, e o `ForwardFlow` prepara o pipeline do material novo.
- **A11 Fixtures**: `trajectories-*.bin`, `render-*`, `particles-*`, `softSurface-*`, `pointCloud`, `fluidSurface-*`,
  `fluidBehavior-*`, `contacts-*`; `shaderLibrary` confere cada módulo da `wgslLib` com referência em CPU.

## Decisões

### R1 Ponto = módulo substituível (C2)

`WgslPoint` (C2, `scene/shaders`): nome do ponto, nome da função, assinatura (parâmetros e retorno em tipos WGSL) e o
módulo pronto. Os kernels exigem o **módulo pronto** do ponto, como hoje exigem qualquer módulo. Uma função nova:

```ts
bindPoints(entry: WgslModule, impls: ReadonlyMap<WgslPoint, WgslModule>): WgslModule
```

devolve um módulo de entrada novo cuja árvore de `requires` troca o módulo pronto de cada ponto pelo do usuário
(nome `entry@impl`, memorizado por identidade de `(entry, impls)`). `composeWgsl` não muda: a regra "um símbolo, uma
definição" vale no pipeline final, e a identidade do shader composto continua por módulo de entrada.

- Validação síncrona na criação (`WgslPoint.check(module)`): a função com o nome do ponto existe, parâmetros e
  retorno batem com a assinatura (comparação textual normalizada dos tipos, sem comentários), nenhum símbolo do
  usuário colide com símbolos do núcleo exigidos pelo kernel. Erro `WgslCompositionError('point-signature' |
'symbol-conflict')` com ponto, esperado e recebido.
- **Alternativas rejeitadas**: (a) `#ifdef`/texto colado — viola a composição por módulos e os testes de montagem
  manual; (b) override por nome no `composeWgsl` (último vence) — quebra a regra de símbolo único e esconde
  conflitos; (c) Flow inteiro por função — o usuário teria de escrever N3 para fazer N2.

### R2 Função como Resource (C2 base, C3 por ponto)

`ExtensionFunction<P>` (C2, `scene/contracts`): Resource com `code` (WGSL), `params` (campos → `FieldType`) e
`values`. O schema dos parâmetros é gerado (`StructSchema` com nome derivado do ponto e de um hash do código e dos
campos), e o módulo do usuário é um `WgslModule` com esse struct. Os parâmetros vivem num pool do schema (um
registro por função), escritos pela C2 como qualquer dado de Resource — mudar `values` não recompila (FR-009).

Classes por ponto na C3, porque uma entidade pode ter vários pontos ao mesmo tempo (o World guarda um Resource por
tipo): `TransformFunction`, `CameraFunction`, `SurfaceFunction`, `SpaceFunction`, `FieldFunction`,
`MaterialFunction`, `EmitFunction`. Cada uma fixa o ponto e expõe as prontas como fábricas (`TransformFunction.trs`
não precisa existir: ausência = pronta).

Funções com o mesmo código e os mesmos campos compartilham o módulo (o hash é o mesmo) e portanto o pipeline; só o
registro de parâmetros difere.

### R3 Troca e rejeição (C1 + C2)

- **C1**: `EngineCore` ganha `shaderMessages(spec: ShaderModuleSpec): Promise<readonly ShaderMessage[]>`
  (`getCompilationInfo()`), e `createAsync` passa a rejeitar com a mensagem do device (escopo de validação em volta da
  criação assíncrona). Reexport do tipo pela C2 (`scene/contracts/gpu`).
- **C2**: `composeWgsl` devolve também `ranges` (módulo → linha inicial/final no fonte composto), para traduzir a
  linha do erro para a linha do código do usuário.
- Mutação de `code` emite `resourceDirty`; o Flow dono do ponto (tabela de transições) prepara o pipeline novo com
  `preferAsync` sob um id novo e **só troca** quando ele compila. Se falha: evento `extensionRejected { point,
resource, message, line }`, aviso único por versão do código, e o pipeline anterior continua. Na criação inicial
  sem pipeline anterior: o grupo daquela função usa a implementação pronta até haver uma válida.
- **Alternativa rejeitada**: compilação síncrona com `pushErrorScope` — trava o quadro na troca e o erro só chega
  assíncrono de qualquer forma.

### R4 transform (C3)

`TransformFlow` mantém o caminho atual intacto para entidades sem função (mesmos kernels, mesmo despacho — bit a
bit). Entidades com `TransformFunction` formam grupos por função (`EntityGroups`, como os grupos de desenho da 007):
um despacho por grupo de `transform_compose_fn` (o kernel do grupo lê a lista de slots do grupo), composto com
`bindPoints` sobre o módulo `transformLocal`. Assinatura:

```wgsl
fn transform_fn(slot: u32, t: Transform, data: <Params>, time: f32) -> mat4x4f
```

A matriz normal sai de `transpose(inverse(mat3(world)))` calculada pelo núcleo depois da função. `transform_link`
(Parent) roda depois de todos os grupos, sem mudança. `TransformParams` ganha `time` (não altera as contas do TRS).

### R5 camera (C3)

`CameraFunction` por câmera: `fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: <Params>, time: f32) ->
CameraOut { view, projection }`; câmeras sem função seguem o `camera_compose` atual. Projeção não linear: a função
pode definir também `fn camera_project(view_pos: vec3f, data: <Params>) -> vec4f` (clip); quando a câmera ativa tem
`camera_project`, o `ForwardFlow` usa a variante do forward cujo `vs_main` chama o ponto `cameraProject` (pronto:
`projection * vec4(view_pos, 1)`). Sombra não muda (câmera da luz). Limite documentado: projeção não linear é feita por
vértice; triângulos grandes não se curvam (malhas finas nas cenas de exemplo).

### R6 field (C3)

Duas partes, para manter a gravidade de hoje bit a bit:

1. A **gravidade uniforme** continua no uniforme de cada solver (mesma conta).
2. Um módulo de ponto `fieldAccel` com `fn field_accel(x: vec3f, v: vec3f, time: f32, body: FieldBody) -> vec3f` é
   somado à gravidade: `v += (g + field_accel(...)) · dt`. O pronto **sem campos** devolve `vec3f(0)`, e `g + 0 == g`
   em ponto flutuante — trajetórias idênticas.

Com campos na cena, a C3 compõe `field_accel` = laço sobre o pool `ForceFieldRecord` (registro comum: tipo, vetores e
escalares; vento, vórtice, arrasto, empuxo, gravidade de fonte pontual) + chamada de cada `FieldFunction` do usuário
(cada uma com o seu nome gerado, somadas por uma função gerada). Adicionar ou remover um campo pronto só muda dados
(sem recompilar); adicionar uma função do usuário recompila os seis solvers uma vez. `FieldBody` traz massa inversa,
densidade e volume da partícula/corpo (empuxo e arrasto dependem disso). Corpo rígido: campo no centro de massa (sem
torque nesta spec). Vento com turbulência: ruído de valor do `noise` da `wgslLib` em (x, t).

`ForceField` passa a declarar, além do uniforme atual, o registro no pool comum (o uniforme de cada campo some se
nenhum Flow o usa — decidido no inventário de Resources na implementação).

### R7 emit (C3)

`EmitterFlow` para `ComputeParticleEmitter`: taxa e acumulador na CPU (determinístico pelo passo fixo, sem leitura de
volta), anel de partículas na GPU (`head` no uniforme), kernels `emit_spawn` (chama `emit_fn(i, time, seed, data) ->
EmittedParticle`), `emit_update` (idade, `field_accel` + gravidade, morte) e `emit_vertex_write` para uma
`PointCloudGeometry` desenhada pelo `PointSpriteMaterial` (partícula morta → tamanho 0). Prontos: ponto, esfera, cone
em WGSL (as formas de CPU continuam para o `ScriptedParticleEmitter`). Aleatoriedade por hash de (i, semente).
Contagem viva = mín(taxa × vida, capacidade), calculada na CPU.

### R8 surface (C3)

`ParametricSurface` (Resource de geometria) com resolução (nu × nv), domínio e fechamento em u/v, mais uma
`SurfaceFunction` (ou pronta: plano, esfera, toro, terreno por ruído). `SurfaceFlow` avalia a grade numa
`SurfaceGeometry` (posições, normais, uv) — índices fixos gerados uma vez. Derivadas: `surface_du`/`surface_dv` se a
função as define; senão diferenças centrais com passo relativo 1e-3 do domínio. Avalia de novo só quando a função
depende do tempo (`animated`) ou quando parâmetros mudam. Homotopia = uma `SurfaceFunction` que mistura duas
prontas por `data.s` ou pelo tempo.

### R9 space (C3)

`SpaceFunction` de cena: `fn space_fn(x: vec3f, time: f32, data) -> vec3f` e, opcional, `space_jacobian(x, time,
data) -> mat3x3f` (senão diferenças centrais). Nesta spec é aplicada pelo `SurfaceFlow`, nas coordenadas locais da
superfície, depois da avaliação: x' = space(x), n' = normalize(J⁻ᵀ n); J singular (|det| < 1e-8) mantém n. A aplicação
em coordenadas de mundo a toda a geometria, luz e sombra é da 019. Pronta: identidade (o `SurfaceFlow` nem chama).

### R10 material (C3)

Ponto `materialEval`: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: <Params>) -> SurfaceParams`, com
`SurfaceSample { world_position, normal, uv, time }` e `SurfaceParams { base_color, roughness, metallic, emissive }`.
O forward passa a calcular a cor por `material_eval` (pronta: `base_color = m.albedo`, `emissive = 0`) e a somar
`emissive` (+0 = idêntico). `uv` passa ao fragmento por uma variável interpolada nova (não muda pixels). A
`MaterialFunction` anexada à entidade entra na chave do pipeline do grupo de desenho (material, função). O modelo de
luz continua o de hoje (Cook-Torrance na 011).

### R11 Tempo

Toda função recebe `time` = tempo da simulação em segundos (`Time`), escrito nos parâmetros de cada estágio no
`framePrepare`; passo fixo garante a mesma trajetória a 30/60/144 Hz. Precisão de `f32` documentada (≈ 1 ms após
~2 h); `wrap` não é feito.

### R12 Medição

- Smoke novo `extensionPoints` com um caso por ponto (US1–US4), medidas impressas e fixture de medidas + imagens.
- Fixtures existentes: nenhuma regravada (SC-001).
- Bench: variante `instances 10k-functions` (10 funções `transform` distintas em 10 k objetos) para SC-008.
- Vídeos: órbita, olho de peixe, campos, emissores, homotopia, torção, xadrez.
