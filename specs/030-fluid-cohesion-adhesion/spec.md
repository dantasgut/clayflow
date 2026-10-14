# Feature Specification: Coesão e adesão de fluidos

**Feature Branch**: `feature/030-fluid-cohesion-adhesion`

**Created**: 2026-10-14

**Status**: Implementada (2026-10-14) — T001–T027 concluídas, gate verde, baseline regravado; coesão 3 e adesão 8 de referência calibradas; filete trocado por jato esticado (SC-002)

**Input**: User description: "Coesão e adesão de fluidos (spec 030, fase F5 do roadmap, número fora da sequência como a
029 — `030-fluid-cohesion-adhesion`). Continuação da 017 pedida pelo usuário: a água ainda não tem coesão (tensão
superficial) nem adesão (molhar superfícies). Implementar no lugar arquitetural certo (C1–C4,
`architecture_resource_loaders.md` autoritativo), sem helpers (Resource + evento + Flow), motor agnóstico. Escopo: (1)
coesão/tensão superficial no SPH e no PBF (modelo de Akinci et al. 2013: coesão entre partículas + termo de curvatura),
com parâmetro por material do fluido; gotas que se arredondam, filetes que se partem em gotas, borda que se fecha; (2)
XSPH hoje fixo em 0,05 passa a vir do material (calibrado); (3) adesão às fronteiras sólidas que o fluido já enxerga
(paredes do domínio) por uma interface genérica de fronteira, que os colisores de fluido da 015/016 alimentarão depois —
parâmetro de adesão por material (ângulo de contato aparente: molha vs repele); (4) MPM fluido: ler `viscosity`
(pendência F5/016) se couber. Critérios: gota isolada converge para forma arredondada; filete se parte; com adesão alta a
água sobe/gruda na parede, com zero não; coesão/adesão zero reproduzem exatamente a trajetória atual (fixtures sem
regravar); mesma trajetória a 30/60/144 Hz; sem leitura de volta por quadro; sem regressão de `bench:check` e baseline
regravado; smokes inclusive `--dist`; gate completo verde; vídeos dos resultados para o usuário. Fora de escopo:
colisores SDF/malha para fluido e acoplamento entre solvers (015/016), espuma/spray (F9). Branch:
feature/030-fluid-cohesion-adhesion a partir de develop (git flow)."

## Contexto e Problema

A 017 deixou a água contínua e com cáusticas; a correção da viscosidade do SPH tirou o aspecto de "caldo grosso". Falta
o comportamento de superfície de um líquido real. Levantamento no código (`develop` em `a0b3437`):

| Lacuna                   | Estado atual (evidência)                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem coesão no SPH        | `sph_forces.wgsl` soma pressão, viscosidade e XSPH; nenhuma atração entre partículas nem termo de curvatura: gotas não se arredondam, filetes não se partem                                               |
| Coesão do PBF acidental  | O único efeito parecido é o termo anti-aglomeração `s_corr` (`pbf_position_correct.wgsl`), uma constante calibrada para estabilidade (`PBF_S_CORR_K_AT_5CM`), sem controle pelo material                  |
| XSPH fixo                | `SPH_XSPH = 0.05` e `PBF_XSPH = 0.05` são constantes nos Flows (`SPHFlow.ts`, `PBFFlow.ts`): a "suavização de velocidade" é igual para água, mel ou mercúrio                                              |
| Sem adesão               | As fronteiras (limites do domínio em `sph_collision.wgsl`/`pbf_collision.wgsl`; colliders do conjunto via `collider_set_push_out`) só empurram para fora e refletem a velocidade: a água nunca molha nada |
| MPM ignora a viscosidade | `MPMFlow` escreve `viscosity` nos parâmetros, mas nenhum kernel do MPM lê o valor (pendência F5/016)                                                                                                      |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Coesão: líquido que se mantém junto (Priority: P1)

Quem monta uma cena com um corpo de fluido (SPH ou PBF) declara no material quanto o líquido "se puxa": água com a
coesão da água forma gotas arredondadas, um filete que cai se parte em gotas, a borda de uma poça se fecha em vez de
espalhar partículas soltas. Coesão zero mantém o comportamento de hoje.

**Why this priority**: é o que o usuário viu faltar no vídeo da 017 ("coesão e adesão") e o que mais muda a leitura de
"água" na tela; não depende de nenhuma outra parte.

**Independent Test**: cenas de gota isolada em gravidade zero, filete caindo e poça, com coesão ligada e desligada;
medir a forma da gota, a quebra do filete e as partículas soltas na borda.

**Acceptance Scenarios**:

1. **Given** um bloco alongado de fluido (16 × 6 × 6 partículas) em gravidade zero com coesão de água, **When** a
   simulação corre 3 s, **Then** o corpo forma uma gota: um corpo só, arredondado (razão entre o maior e o menor
   semieixo ≤ 1,15), no SPH e no PBF.
2. **Given** o mesmo bloco com coesão zero, **When** corre 3 s, **Then** não se forma uma gota pelo mesmo critério — o
   corpo continua alongado ou se dispersa (a coesão é a causa, não outra força).
3. **Given** um jato de fluido (64 × 3 × 3 partículas, sem gravidade, esticado com velocidade proporcional à posição ao
   longo do eixo, 1/s) com coesão de água, **When** corre 2 s, **Then** o jato se parte em pelo menos duas gotas (≥ 20
   partículas cada); sem coesão, vira um fio só, sem gotas.
4. **Given** uma barragem com coesão de água, **When** a água assenta, **Then** há menos partículas isoladas (sem
   vizinhas) na borda do que com coesão zero, e nenhuma partícula ganha energia sem fonte (o corpo assenta).
5. **Given** coesão zero (o padrão), **When** qualquer cena existente roda, **Then** as trajetórias são idênticas, bit a
   bit, às fixtures atuais.

---

### User Story 2 - Adesão: líquido que molha (ou não) as superfícies (Priority: P1)

Quem monta a cena declara no material quanto o líquido "gruda" nas superfícies sólidas: com adesão alta, a água sobe
um pouco pela parede (menisco), escorre aderida e deixa filme; com adesão zero, ela se afasta da parede (gota em
superfície hidrofóbica). Vale para toda fronteira sólida que o fluido já enxerga: os limites do domínio e os colliders
do conjunto (plano, caixa, esfera).

**Why this priority**: é a outra metade do pedido do usuário; é o que faz a água "encostar" de forma crível nas paredes
do tanque e nos objetos submersos da 017.

**Independent Test**: um tanque com fluido em repouso e uma esfera ou placa inclinada com gotas; adesão alta × zero;
medir a altura do fluido junto à parede, a permanência das gotas na placa e o ângulo aparente.

**Acceptance Scenarios**:

1. **Given** fluido em repouso num tanque com adesão alta, **When** assenta, **Then** a altura do fluido junto à parede
   é maior que no centro (menisco côncavo); com adesão zero não é.
2. **Given** uma gota sobre uma placa inclinada (collider), **When** a adesão é alta, **Then** a gota escorre mais
   devagar e deixa partículas aderidas ao longo do caminho; com adesão zero, escorre livre e não deixa nenhuma.
3. **Given** uma gota pousada numa placa horizontal, **When** a adesão sobe de zero ao máximo, **Then** a gota se
   espalha mais (área de contato monotônica com a adesão).
4. **Given** adesão zero (o padrão), **When** qualquer cena existente roda, **Then** as trajetórias são idênticas às
   fixtures atuais.

---

### User Story 3 - Material que define o comportamento do líquido (Priority: P2)

A viscosidade aparente que hoje vem de uma constante fixa nos solvers (suavização de velocidade) passa a vir do
material, com um padrão que reproduz o atual; o MPM em modo fluido passa a usar a viscosidade do material. Com isso,
um mesmo motor representa água, óleo ou mel só trocando o material.

**Why this priority**: completa o controle pelo material; sem ela, coesão e adesão convivem com um amortecimento que o
autor da cena não controla.

**Independent Test**: dois materiais (suavização baixa e alta; viscosidade baixa e alta no MPM) na mesma cena; medir a
dissipação de energia cinética e o espalhamento de uma barragem.

**Acceptance Scenarios**:

1. **Given** um material sem a suavização declarada, **When** a cena roda, **Then** o resultado é idêntico ao de hoje.
2. **Given** dois corpos idênticos com suavização baixa e alta, **When** correm 2 s, **Then** o de suavização alta
   dissipa mais energia cinética.
3. **Given** um corpo MPM fluido com viscosidade alta e outro com baixa, **When** a barragem corre 2 s, **Then** o de
   viscosidade alta espalha menos (frente da onda mais curta).
4. **Given** um material com valores inválidos (negativos, não finitos), **When** é criado, **Then** a criação falha
   com mensagem que nomeia o campo.

---

### User Story 4 - Ajuste em execução e medição (Priority: P2)

Quem ajusta a cena muda coesão, adesão e suavização com a simulação rodando e vê o efeito no quadro seguinte, sem
recriar corpos. O custo dos novos termos é medido na cena de partículas e não regride o baseline.

**Why this priority**: torna os parâmetros utilizáveis na prática (ajuste fino ao vivo) e garante o orçamento.

**Independent Test**: trocar os parâmetros do material durante a execução e observar a mudança; `bench` com variantes
de fluido com coesão e adesão.

**Acceptance Scenarios**:

1. **Given** uma cena rodando com coesão zero, **When** a coesão do material muda, **Then** o efeito aparece a partir do
   passo seguinte, sem recriar o corpo nem realocar recursos.
2. **Given** a cena `particles` com fluido de 64k partículas, **When** coesão e adesão estão ligadas, **Then** o tempo de
   GPU da simulação cresce no máximo 25% em relação à mesma cena com elas desligadas.

### Edge Cases

- Partícula sem vizinhas (respingo isolado): coesão e curvatura não produzem força (sem divisão por zero, sem NaN).
- Duas partículas quase coincidentes: a força de coesão é limitada (o núcleo repulsivo do modelo evita colapso).
- Dois corpos de fluido do mesmo solver se tocando: o material de partículas é um por cena, então são o mesmo líquido —
  a coesão age entre eles como dentro de cada um (como a pressão já age hoje); fluidos de solvers diferentes não se
  veem (acoplamento é 015/016).
- Fluido sobre um collider que se move (corpo rígido dinâmico): a adesão age na pose atual do collider; não arrasta o
  corpo rígido (sem reação no rígido — acoplamento é 015/016).
- Adesão muito alta: o fluido não atravessa a fronteira nem fica "colado" além do alcance de uma suavização (a adesão
  só age a até uma distância de kernel da superfície).
- Coesão muito alta: a simulação continua estável dentro do passo estável do material (sem explosão); valores fora da
  faixa estável são limitados e avisados uma vez.
- Taxas de quadro diferentes (30/60/144 Hz): mesma trajetória, como hoje.
- Corpo com `FluidSurfaceMaterial` (017) ou sprites: o desenho não muda; só a simulação.

## Requirements _(mandatory)_

### Functional Requirements

**Coesão**

- **FR-001**: O material de partículas DEVE ter um parâmetro de coesão (tensão superficial) não negativo, padrão zero.
- **FR-002**: O SPH DEVE aplicar, com coesão > 0, a tensão superficial de Akinci et al. 2013: força de coesão entre
  partículas vizinhas do mesmo solver (atração em média distância, repulsão em curta) e termo de curvatura pela normal de
  superfície estimada, normalizados pela densidade.
- **FR-003**: O PBF DEVE aplicar a mesma tensão superficial, com o mesmo significado do parâmetro, coerente com sua
  integração por posições (mesma gota converge para forma arredondada nos dois solvers pelos critérios da US1).
- **FR-004**: O termo anti-aglomeração do PBF DEVE continuar existindo para estabilidade, independente da coesão.
- **FR-005**: Coesão zero DEVE produzir trajetórias idênticas, bit a bit, às atuais (o termo não é avaliado, ou é
  avaliado sem efeito numérico).

**Adesão**

- **FR-006**: O material de partículas DEVE ter um parâmetro de adesão não negativo, padrão zero.
- **FR-007**: A adesão DEVE agir entre o fluido e toda fronteira sólida que o solver já trata: limites do domínio e
  colliders do conjunto (plano, caixa, esfera), atraindo a partícula para a superfície dentro de uma distância de kernel,
  sem deixá-la atravessar.
- **FR-008**: A adesão DEVE ser calculada sobre uma descrição genérica de fronteira (distância e normal até a superfície
  sólida mais próxima), de modo que fronteiras novas (colisores de fluido da 015/016, SDF de superfícies paramétricas)
  passem a receber adesão sem mudar o termo.
- **FR-009**: A adesão DEVE ter efeito também tangencial (aderência ao escorrer: fluido junto à parede escorre mais
  devagar), proporcional ao parâmetro.
- **FR-010**: Adesão zero DEVE produzir trajetórias idênticas às atuais.

**Material e solvers**

- **FR-011**: A suavização de velocidade (XSPH) DEVE vir do material, com padrão 0,05 (o valor atual), no SPH e no PBF.
- **FR-012**: O MPM em modo fluido DEVE usar a viscosidade do material (tensão viscosa proporcional à taxa de
  deformação); a pendência F5/016 sobre `viscosity` no MPM é resolvida.
- **FR-013**: Os parâmetros novos DEVEM ser validados na criação (não negativos e finitos), com erro que nomeia o campo.
- **FR-014**: Mudar coesão, adesão, suavização ou viscosidade em execução DEVE ter efeito a partir do passo seguinte,
  sem recriar corpos nem realocar recursos.
- **FR-015**: Valores acima da faixa estável para o passo do material DEVEM ser limitados no solver, com um aviso único
  por material.
- **FR-016**: A simulação DEVE continuar sem leitura de volta para a CPU por quadro.
- **FR-017**: A trajetória DEVE ser a mesma a 30, 60 e 144 Hz com coesão e adesão ligadas (passo fixo, como hoje).

**Arquitetura**

- **FR-018**: Os parâmetros DEVEM viver no Resource do material e chegar aos kernels pelos dados do material e dos
  parâmetros dos solvers já existentes (Resource + evento + Flow); nenhuma função auxiliar fora desse caminho.
- **FR-019**: A descrição genérica de fronteira (FR-008) DEVE ser um ponto único compartilhado por SPH e PBF, definido
  uma vez (sem duplicar símbolos entre arquivos).

**Verificação e entrega**

- **FR-020**: DEVE haver um smoke de comportamento de fluido com as cenas das US1–US3 (gota em gravidade zero, filete,
  barragem, menisco no tanque, placa inclinada, gota na placa horizontal, MPM com duas viscosidades), com medidas
  numéricas e fixtures próprias.
- **FR-021**: Os smokes existentes DEVEM passar sem regravar fixtures, exceto as do MPM fluido afetadas por FR-012, que
  são regravadas e listadas para aprovação no PR.
- **FR-022**: A cena de bench `particles` DEVE ganhar variantes de fluido com coesão e adesão; `bench:check` sem
  regressão nas variantes existentes; baseline regravado ao fim.
- **FR-023**: Gate completo verde (format, lint, tipos, testes com cobertura, build da biblioteca minificada, smokes no
  fonte e com `--dist`, cobertura de documentação).
- **FR-024**: Vídeos dos resultados (gota se arredondando, filete se partindo, menisco, placa inclinada, barragem com
  água da 017) gravados e enviados ao usuário.
- **FR-025**: Documentação (arquitetura, guia de materiais de partículas, ROADMAP e PENDENCIAS) atualizada.

### Key Entities

- **Material de partículas**: ganha coesão, adesão e suavização de velocidade; a viscosidade passa a valer também no
  MPM fluido. Continua sendo o único lugar onde o comportamento do líquido é declarado.
- **Fronteira sólida (para o fluido)**: o que o fluido enxerga de cada sólido — distância e normal até a superfície mais
  próxima. Hoje alimentada pelos limites do domínio e pelos colliders do conjunto; depois, pelos colisores da 015/016.
- **Parâmetros dos solvers SPH/PBF/MPM**: recebem os valores do material por passo (já existentes; ganham os campos).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Bloco alongado em gravidade zero com coesão de água forma, em 3 s, uma gota (um corpo, razão de semieixos ≤
  1,15) no SPH e no PBF; com coesão zero, não.
- **SC-002**: Jato esticado com coesão de água se parte em ≥ 2 gotas em 2 s; sem coesão, não forma gotas.
- **SC-003**: Com adesão alta, a altura do fluido junto à parede supera a do centro em pelo menos meio espaçamento de
  partícula; com adesão zero, não.
- **SC-004**: Na placa inclinada, com adesão alta, a gota leva ≥ 30% mais tempo para percorrer a placa e deixa
  partículas aderidas; com adesão zero, não deixa nenhuma.
- **SC-005**: Área de contato da gota na placa horizontal cresce monotonicamente com a adesão (≥ 3 valores medidos).
- **SC-006**: MPM fluido com viscosidade alta espalha ≥ 20% menos em 2 s que com viscosidade baixa.
- **SC-007**: Com coesão, adesão e suavização nos valores padrão, todas as fixtures existentes (exceto MPM fluido, FR-021)
  passam sem regravar.
- **SC-008**: Mesma trajetória a 30/60/144 Hz com coesão e adesão ligadas.
- **SC-009**: Custo da simulação com coesão e adesão ligadas ≤ 125% do custo com elas desligadas na cena de 64k
  partículas; nenhuma regressão no `bench:check`.
- **SC-010**: Zero leituras de volta por quadro; nenhum NaN nas partículas em nenhuma cena do smoke.

## Assumptions

- Escala dos parâmetros: coesão e adesão são adimensionais por material, com faixa de 0 a 1 como faixa de uso, e um
  valor de referência "água" documentado; a calibração exata fica no research do plan.
- "Coesão de água" nos critérios é o valor de referência documentado para água na escala das cenas de teste
  (espaçamento de 2–5 cm), não a tensão superficial física de 0,072 N/m, que nessa escala seria invisível.
- O material de partículas continua um por cena (recurso único, como hoje); "por material" nos requisitos é por cena.
  Coesão entre solvers diferentes é acoplamento (015/016).
- Colliders de malha não geram contato hoje (lacuna P2); não recebem adesão até ganharem contato.
- A adesão não aplica reação nos corpos rígidos (acoplamento bidirecional é 015/016).
- O desenho (sprites, água da 017) não muda; só a simulação.
- O número 030 fica fora da sequência, como a 029, para não renumerar as specs seguintes; ela entra na linha F5 do
  ROADMAP.
