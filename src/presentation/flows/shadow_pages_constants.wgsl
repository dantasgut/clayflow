// Constantes das páginas do mapa de sombra virtual (spec 034, T060): as seções do `sp_scratch`, os bits dos grupos,
// das filas e dos pares — comuns aos kernels das páginas e ao desenho delas.

/** Contadores na seção de estado do `sp_scratch` (comuns a todas as vistas: o reservatório e as sujas). */
const SP_FREE_COUNT: u32 = 0u;
const SP_DIRTY_COUNT: u32 = 1u;
/**
 * O estado de cada vista de sombra (spec 013), no começo da seção dela no `sp_scratch` (`SPV_STATE` palavras): as
 * dinâmicas (quantas, e se a lista transbordou) e as filas por nível (16 contadores a partir de `SPV_LEVEL_WORK`).
 */
const SPV_DYNAMIC_COUNT: u32 = 0u;
const SPV_OVERFLOW: u32 = 1u;
const SPV_LEVEL_WORK: u32 = 16u;
const SPV_STATE: u32 = 32u;
/** Quadros sem pedido em que a página ainda fica no atlas. */
const SP_MAX_AGE: u32 = 30u;
/** Bit do grupo na palavra da instância: grupo que não projeta (fora do desenho). */
const SP_SKIP: u32 = 0x80000000u;
const SP_GROUP_MASK: u32 = 0x7FFFFFFFu;
/**
 * Palavras de um grupo de desenho em `sp_groups`: a primeira instância, quantas, a lista dos aglomerados (0: a malha
 * inteira), o registro dos argumentos, as vistas de sombra em que o grupo é desenhado (um bit por vista) e os bits
 * `SP_GROUP_*`. Um grupo de instâncias com malha própria por vista (a adaptativa) tem um grupo de desenho por malha, em
 * sequência (`SP_GROUP_MORE`): a palavra da instância aponta o primeiro.
 */
const SP_GROUP_WORDS: u32 = 6u;
/** Bit do grupo de desenho: geometria deformada pela GPU neste quadro. */
const SP_GROUP_DEFORMING: u32 = 1u;
/** Bit do grupo de desenho: o seguinte desenha as mesmas instâncias em outras vistas. */
const SP_GROUP_MORE: u32 = 2u;
/** Grupos de desenho de um grupo de instâncias, no máximo (um por vista e o das demais). */
const SP_GROUP_VARIANTS: u32 = 17u;
/** Bit da fila: redesenho (a página física já existe). */
const SP_RERENDER: u32 = 0x80000000u;
/** Bits do índice da instância no par (o resto é a página suja). */
const SP_PAIR_SHIFT: u32 = 20u;
const SP_PAIR_MASK: u32 = 0xFFFFFu;
/** Teto dos grupos percorridos pela repartição dos pares (orçamento do laço). */
const SP_GROUP_LIMIT: u32 = 1048576u;
/** Necessidade da página virtual (seção `needBase`): página física nova ou redesenho na que já tem. */
const SP_NEED_ALLOC: u32 = 1u;
const SP_NEED_RENDER: u32 = 2u;
/** Páginas por invocação na montagem das filas (4096 páginas por nível / 256 invocações). */
const SP_RANK_CHUNK: u32 = 16u;
/** Páginas físicas por invocação na pilha das livres (64² páginas / 256 invocações). */
const SP_FREE_CHUNK: u32 = 16u;
/** Posições da ordem por invocação na alocação (64² páginas físicas / 256 invocações: o atlas inteiro num quadro). */
const SP_ALLOCATE_CHUNK: u32 = 16u;
/** Páginas por eixo que um pedido do quadro anterior alcança no referencial de agora, no máximo (`sp_requests_main`). */
const SP_REQUEST_SPAN: i32 = 4;
/** Grupos de trabalho por linha do despacho indireto dos pares (o mínimo garantido de grupos por dimensão). */
const SP_DISPATCH_ROW: u32 = 65535u;
/** Triângulos por aglomerado das malhas grandes. */
const SP_CLUSTER_TRIS: u32 = 32u;
/** Instâncias de um grupo em aglomerados, no máximo. */
const SP_CLUSTER_MAX_INSTANCES: u32 = 16u;
/** Teto dos pares de um grupo percorridos por aglomerado (16 instâncias × 256 páginas sujas). */
const SP_CLUSTER_PAIR_LIMIT: u32 = 4096u;
/** Lugares da lista de um grupo por aglomerado (o par local nos bits altos, o aglomerado nos baixos). */
const SP_CLUSTER_SLOTS: u32 = 32u;
const SP_CLUSTER_SHIFT: u32 = 20u;
const SP_CLUSTER_MASK: u32 = 0xFFFFFu;
/** A página suja na seção das necessidades depois da alocação (`sp_allocate_main`): a marca e a posição na lista. */
const SP_DIRTY_MARK: u32 = 0x80000000u;
/** A primeira palavra de uma página suja: a física (16 bits), o nível (4) e a vista (4). */
const SP_DIRTY_PHYS_MASK: u32 = 0xFFFFu;
const SP_DIRTY_LEVEL_SHIFT: u32 = 16u;
const SP_DIRTY_VIEW_SHIFT: u32 = 20u;
const SP_DIRTY_FIELD_MASK: u32 = 0xFu;
/** O retângulo, no plano de uma vista em perspectiva, da caixa que cruza o plano próximo dela: o tronco inteiro e a borda. */
const SP_FRUSTUM_REACH: f32 = 2.0;
/** Rodadas da busca do rodízio entre as vistas (uma fila tem até 4096 páginas: 64² por nível). */
const SP_ROUND_STEPS: u32 = 13u;
const SP_ROUND_MAX: u32 = 4096u;
/** Sprites que projetam (esferas impostoras): palavras por entrada da lista (centro no espaço da luz, raio, página suja). */
const SS_ENTRY_WORDS: u32 = 5u;
/** Páginas por eixo que um sprite alcança num nível, no máximo (o laço da lista). */
const SS_PAGE_SPAN: i32 = 4;
/** Pontos por invocação no retângulo de uma fonte (256 invocações: até 1 048 576 pontos). */
const SS_RECT_CHUNK: u32 = 4096u;
