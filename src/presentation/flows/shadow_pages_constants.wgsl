// Constantes das páginas do mapa de sombra virtual (spec 034, T060): as seções do `sp_scratch`, os bits dos grupos,
// das filas e dos pares — comuns aos kernels das páginas e ao desenho delas.

/** Contadores na seção de estado do `sp_scratch`. */
const SP_FREE_COUNT: u32 = 0u;
const SP_DIRTY_COUNT: u32 = 1u;
const SP_DYNAMIC_COUNT: u32 = 2u;
const SP_OVERFLOW: u32 = 4u;
/** As filas por nível: 16 contadores a partir daqui. */
const SP_LEVEL_WORK: u32 = 16u;
/** Quadros sem pedido em que a página ainda fica no atlas. */
const SP_MAX_AGE: u32 = 30u;
/** Bit do grupo na palavra da instância: grupo que não projeta (fora do desenho). */
const SP_SKIP: u32 = 0x80000000u;
/** Bit do grupo: geometria deformada pela GPU neste quadro. */
const SP_DEFORMING: u32 = 0x40000000u;
const SP_GROUP_MASK: u32 = 0x3FFFFFFFu;
/** Bit da fila: redesenho (a página física já existe). */
const SP_RERENDER: u32 = 0x80000000u;
/** Bits do índice da instância no par (o resto é a página suja). */
const SP_PAIR_SHIFT: u32 = 20u;
const SP_PAIR_MASK: u32 = 0xFFFFFu;
/** Teto das rodadas da caixa por invocação (vértices = 256 × rodadas). */
const SP_BOUNDS_ROUNDS: u32 = 65536u;
/** Teto dos grupos percorridos pela repartição dos pares (orçamento do laço). */
const SP_GROUP_LIMIT: u32 = 1048576u;
/** Necessidade da página virtual (seção `needBase`): página física nova ou redesenho na que já tem. */
const SP_NEED_ALLOC: u32 = 1u;
const SP_NEED_RENDER: u32 = 2u;
/** Páginas por invocação na montagem das filas (4096 páginas por nível / 256 invocações). */
const SP_RANK_CHUNK: u32 = 16u;
/** Páginas físicas por invocação na pilha das livres (48² páginas / 256 invocações). */
const SP_FREE_CHUNK: u32 = 9u;
