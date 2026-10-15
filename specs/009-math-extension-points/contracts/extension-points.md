# Contrato: pontos de extensão

Tipos WGSL; `<P>` é o struct gerado dos parâmetros da função; `time` é o tempo da simulação (s).

| Ponto       | Função obrigatória                                                                   | Funções opcionais                                         | Pronta                                             | Estágio                     |
| ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- | --------------------------- |
| `transform` | `transform_fn(slot: u32, t: Transform, data: P, time: f32) -> mat4x4f`               | —                                                         | TRS (`transform_local`)                            | `TransformFlow` (por grupo) |
| `camera`    | `camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: P, time: f32) -> CameraOut` | `camera_project(view_pos: vec3f, data: P) -> vec4f`       | perspectiva/ortográfica, lookAt                    | `CameraFlow`, forward       |
| `surface`   | `surface_fn(u: f32, v: f32, time: f32, data: P) -> vec3f`                            | `surface_du(...) -> vec3f`, `surface_dv(...) -> vec3f`    | plano, esfera, toro, terreno                       | `SurfaceFlow`               |
| `space`     | `space_fn(x: vec3f, time: f32, data: P) -> vec3f`                                    | `space_jacobian(x: vec3f, time: f32, data: P) -> mat3x3f` | identidade                                         | `SurfaceFlow`               |
| `field`     | `field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: P) -> vec3f`         | —                                                         | vento, vórtice, arrasto, empuxo, gravidade pontual | seis solvers, emissor       |
| `material`  | `material_fn(s: SurfaceSample, m: StandardMaterial, data: P) -> SurfaceParams`       | —                                                         | constantes do material                             | forward (fragmento)         |
| `emit`      | `emit_fn(i: u32, time: f32, seed: u32, data: P) -> EmittedParticle`                  | —                                                         | ponto, esfera, cone                                | `EmitterFlow`               |

## Regras

1. A função obrigatória tem exatamente o nome e a assinatura da tabela; tipos comparados sem espaços e comentários.
2. O código pode definir funções auxiliares; nenhum símbolo pode colidir com os do núcleo presentes no pipeline
   (erro com o nome do símbolo).
3. Retorno não finito: `transform` mantém a matriz anterior; `emit` não cria a partícula; `field` soma zero; `surface`
   e `space` mantêm o vértice anterior. Infinitos são sempre descartados; NaN depende da GPU (compiladores com
   matemática rápida podem não preservá-lo).
4. Erro de assinatura ou símbolo: exceção síncrona na criação do Resource. Erro de compilação: evento
   `extensionRejected { point, resource, message, line }` (linha no código do usuário) e o pipeline anterior continua.
5. Sem função, o estágio usa o pronto e produz exatamente o resultado de antes desta spec.
6. Mudar `values` vale no quadro seguinte sem recompilar; mudar `code` vale no primeiro quadro após compilar.
