# Feature Specification: Fachada de Autoria de Domínio para Física

**Feature Branch**: `001-physics-authoring-facade`
**Created**: 2026-06-09
**Status**: Ready for planning
**Input**: Equiparar a ergonomia de autoria da física à da renderização — a borda deve falar em vocabulário de domínio (massa, atrito, raio), nunca em layout de buffer GPU (schema, vec4, invMass-no-w), sem desfazer o núcleo data-oriented.

---

## Contexto e Problema

Na arquitetura clean atual, criar um corpo físico na borda exige preencher o struct GPU à mão:

```ts
ball.add(
  new RigidBody({
    schema: LCPSchema,
    data: {
      pos: [-0.4, 4, 0, 1.0], // pos.w = invMass (indescobrível)
      rot: [0, 0, 0, 1],
      rot_pred: [0, 0, 0, 1],
      I_inv: [1, 1, 1, 0], // tensor de inércia inverso
      mat_props: [0.45, 0.3, 0.05, 0.05], // friction/restitution/damping sem nomes
      body_shape: [0, r, r, r], // enum de shape + dims sem nomes
    },
  }),
);
app.flows.register(new LCPFlow(app.core, app.world, app.resources));
```

Na **mesma camada 3**, a renderização é amigável — `new SphereGeometry({ radius })`,
`new StandardMaterial({ albedo, roughness })` — porque Geometry/Material são uma **fachada de
autoria** sobre o núcleo de schema/descriptor. A física **não tem** essa fachada: expõe o núcleo cru.
A assimetria é o diagnóstico, não a falta de primitivos.

**Princípio norteador:** núcleo data-oriented por dentro, vocabulário de domínio por fora. A borda fala
em "massa, atrito, restituição, raio, halfExtents"; só o motor fala em "vec4, invMass no w, pool key,
schema".

---

## User Scenarios & Testing

### Primary User Story

Como desenvolvedor de aplicação integrando o motor, quero criar corpos físicos e colocá-los em simulação
usando termos do domínio (massa, atrito, restituição, forma e dimensões), sem conhecer schemas, layout de
`vec4`, o significado de `pos.w`, nem qual `Flow` registrar — equiparando a experiência à de criar
geometrias e materiais.

### Acceptance Scenarios

1. **Esfera rígida** — Dado um app inicializado, Quando crio uma esfera rígida com
   `{ mass, friction, restitution, radius }` e a insiro no mundo, Então ela cai sob gravidade e colide,
   **sem** eu ter declarado schema, `data` cru ou registrado um flow manualmente.
2. **Caixa rígida** — Dado o mesmo app, Quando crio uma caixa com `{ mass, friction, halfExtents }`,
   Então o corpo simula corretamente com a forma/colisor coerentes com os `halfExtents`.
3. **Corpo estático/cinemático** — Dado um chão, Quando o declaro como estático (massa infinita / kinematic)
   em vocabulário de domínio, Então ele não é movido pela simulação e serve de colisor.
4. **Fluido/soft** — Dado um app, Quando crio um corpo de fluido/soft escolhendo o algoritmo por um nome
   semântico (ex.: `'SPH' | 'PBF' | 'MPM'`, `'XPBD' | 'FEM'`), Então o motor roteia para o solver correto
   sem eu instanciar/registrar o flow.
5. **Fonte única de transform** — Dado um corpo criado com posição inicial, Quando a simulação o move,
   Então não há divergência entre a posição visual e a física (uma única fonte de verdade).
6. **Uso avançado preservado** — Dado um usuário avançado, Quando ele fornece `{ schema, data }` cru,
   Então isso continua funcionando como hoje (a fachada é açúcar, não substituição).

### Edge Cases

- Body criado com um algoritmo/forma para o qual não há flow/colisor disponível → erro claro e cedo
  (vocabulário de domínio), não falha silenciosa de GPU.
- Dois bodies do mesmo algoritmo coexistindo → continuam coalescendo na mesma pool (sem regressão de perf).
- Parâmetros físicos ausentes → defaults sensatos e documentados (ex.: atrito/restituição padrão).
- Valores inválidos (massa negativa, halfExtents zero) → validação com mensagem de domínio.
- **Resolvido (Constituição Princ. II + FR-006):** misturar fachada e `{schema,data}` cru na mesma cena é
  permitido sem ressalvas — a forma crua permanece totalmente suportada e a fachada é açúcar aditivo; ambas
  produzem o mesmo `Resource` e coalescem na mesma pool.

---

## Requirements

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer construção de corpos rígidos via vocabulário de domínio
  (massa, atrito, restituição, damping linear/angular) combinada com forma+dimensões
  (esfera por raio; caixa por halfExtents; plano por normal/offset), sem exigir schema nem `data` cru.
- **FR-002**: O sistema DEVE encapsular internamente o layout GPU hoje exposto — `invMass` em `pos.w`,
  `I_inv`, `mat_props`, `body_shape` — derivando-o dos parâmetros de domínio. O usuário NÃO deve preencher `vec4`.
- **FR-003**: O sistema DEVE oferecer construção de soft bodies e fluidos selecionando o algoritmo por nome
  semântico, sem o usuário importar schema nem instanciar o solver.
- **FR-004**: O sistema DEVE registrar/rotear automaticamente o `Flow` correspondente ao algoritmo/schema do
  corpo inserido, eliminando a chamada manual `flows.register(new XxxFlow(core, world, resources))`.
  Registro manual DEVE continuar possível para casos avançados.
- **FR-005**: O sistema DEVE ter uma fonte única de verdade para a transform de um corpo físico — sem
  duplicação dessincronizável entre o componente de transform visual e o estado físico.
- **FR-006**: O sistema DEVE preservar 100% de retrocompatibilidade com a forma crua `{ schema, data }`
  e com o registro manual de flows (a fachada é aditiva).
- **FR-007**: O sistema DEVE validar parâmetros de domínio e falhar cedo com mensagens no vocabulário do
  usuário (ex.: "massa deve ser > 0"), nunca com erro de layout de buffer.
- **FR-008**: O sistema DEVE expor formas de colisão coerentes com a geometria de forma automática quando
  possível (ex.: caixa de halfExtents X já implica o colisor correspondente) ou com mínima cerimônia.
- **FR-009**: A documentação pública (guias + API) DEVE apresentar a criação de física exclusivamente em
  vocabulário de domínio; a forma crua fica em seção "avançado".
- **FR-010**: A fachada NÃO DEVE alterar a semântica de simulação, os kernels WGSL, nem a estratégia de
  coalescência em pools (sem regressão de performance ou comportamento).

### Key Entities

- **Corpo físico (autoria)** — representação de domínio de um corpo: tipo (rígido/soft/fluido), propriedades
  materiais (massa, atrito, restituição, damping), forma e dimensões, transform inicial. Traduz-se
  internamente para schema + `data`.
- **Forma de colisão (autoria)** — esfera/caixa/plano/malha em vocabulário de domínio (raio, halfExtents,
  normal/offset), desacoplada do enum/`vec4` interno.
- **Algoritmo de simulação** — seletor semântico (`LCP`, `XPBD`, `FEM`, `MPM`, `SPH`, `PBF`) que determina o
  flow/schema sem o usuário tocar nessas entidades internas.
- **Núcleo data-oriented (inalterado)** — `Schema`/`GPUDescriptor`/pool/`Flow`: permanece a verdade interna;
  a fachada produz seus valores, não o substitui.

---

## Success Criteria

- **SC-001**: Criar uma cena física equivalente à atual do `claflow-web` (chão + plataforma + esfera + bastão
  rígidos sob gravidade) sem nenhuma menção a `schema`, `data`, `vec4`, `invMass` ou `flows.register` no
  código do usuário.
- **SC-002**: Nenhum número mágico posicional em `vec4` no código de autoria do usuário — todo parâmetro é nomeado.
- **SC-003**: Zero chamadas manuais de registro de flow numa cena típica.
- **SC-004**: Paridade de ergonomia medível: nº de conceitos/linhas para criar um corpo rígido ≤ ao de criar
  uma geometria+material equivalente.
- **SC-005**: Suíte de testes (CPU-side) cobrindo a tradução domínio→`data` (massa→invMass, material→mat_props,
  forma→body_shape) e o auto-roteamento de flow por algoritmo.
- **SC-006**: Os smokes existentes do `claflow-web` continuam produzindo simulação visualmente idêntica
  (sem regressão de comportamento/performance).

---

## Review & Acceptance Checklist

- [ ] Sem detalhes de implementação (foca no QUÊ/PORQUÊ, não no COMO interno)
- [ ] Requisitos testáveis e não ambíguos
- [ ] Critérios de sucesso mensuráveis
- [ ] Retrocompatibilidade explícita
- [ ] Escopo e não-objetivos delimitados
- [x] `[NEEDS CLARIFICATION]` resolvidos antes de planejar

## Non-Goals

- Reescrever o núcleo data-oriented (schema/descriptor/pool/Flow).
- Alterar kernels WGSL ou a semântica/precisão da simulação.
- Mudar a API de renderização (já amigável) — serve de referência de paridade.
- Resolver os limites algorítmicos da física (contact persistence, warm starting) — fora de escopo.
