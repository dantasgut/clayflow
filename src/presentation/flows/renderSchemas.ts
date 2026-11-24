import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros das páginas do mapa de sombra virtual no quadro (spec 034, T060; spec 013: o atlas único e as vistas).
 *
 * As vistas de sombra, pelo índice da faixa de cada uma no atlas: `viewSpan` (o maior índice vivo mais um: o que os
 * laços percorrem), `liveMask` (um bit por vista viva), `resetMask` (as vistas cuja faixa mudou de dono: o cache delas
 * recomeça), `views0`–`views3` (o slot do referencial de cada vista no pool `ShadowMatrix`, quatro por vetor) e
 * `faces0`–`faces1` (qual das vistas do referencial cada uma é — a face do cubo da pontual —, 4 bits por vista).
 *
 * O estágio: os grupos de desenho e as instâncias, o orçamento de páginas desenhadas por quadro entre as vistas
 * (`budget`), o recomeço de todas (`reset`: a série dos retângulos interrompida, os grupos mudados), se os pedidos do
 * quadro anterior valem (senão, a reserva grossa no frustum), as páginas físicas do atlas (`physical`) e a primeira
 * palavra delas (`pagesBase`), as páginas virtuais de uma faixa (`entries`) e os retângulos por vista na série deles
 * (`rectStride`).
 *
 * As seções do espaço de trabalho (`sp_scratch`, em palavras). Comuns: as páginas físicas em uso (`keepBase`) e livres
 * (`freeBase`), as sujas (`dirtyBase`), as caixas das geometrias (`boundsBase`) e das malhas em aglomerados
 * (`groupBoxBase`), os trechos dos pares por grupo (`groupPairsBase`: contagem, início, preenchimento, o que coube). De
 * cada vista, a partir de `viewBase + v · viewStride` (os deslocamentos são relativos ao começo da seção da vista): o
 * estado, as filas por nível (`workBase`), as necessidades das páginas virtuais (`needBase`), os pedidos do quadro
 * anterior no referencial deste (`requestBase`), as dinâmicas (`dynamicBase`, até `dynamicCap`) e os retângulos das
 * instâncias no plano da vista (`rectsBase`). Em `sp_groups`, a palavra de grupo de cada instância a partir de
 * `instanceGroupBase`; nos argumentos, o registro dos sprites (`spriteRecord`, até `spriteCap` entradas na lista).
 */
export const ShadowPagesParamsSchema = new StructSchema(
    'ShadowPagesParams',
    {
        viewSpan: FieldType.u32,
        liveMask: FieldType.u32,
        resetMask: FieldType.u32,
        groupCount: FieldType.u32,
        instanceCount: FieldType.u32,
        budget: FieldType.u32,
        reset: FieldType.u32,
        requestsValid: FieldType.u32,
        physical: FieldType.u32,
        pagesBase: FieldType.u32,
        entries: FieldType.u32,
        rectStride: FieldType.u32,
        keepBase: FieldType.u32,
        freeBase: FieldType.u32,
        dirtyBase: FieldType.u32,
        boundsBase: FieldType.u32,
        groupBoxBase: FieldType.u32,
        groupPairsBase: FieldType.u32,
        instanceGroupBase: FieldType.u32,
        viewBase: FieldType.u32,
        viewStride: FieldType.u32,
        workBase: FieldType.u32,
        needBase: FieldType.u32,
        requestBase: FieldType.u32,
        dynamicBase: FieldType.u32,
        dynamicCap: FieldType.u32,
        rectsBase: FieldType.u32,
        spriteRecord: FieldType.u32,
        spriteCap: FieldType.u32,
        faces0: FieldType.u32,
        faces1: FieldType.u32,
        _pad0: FieldType.u32,
        views0: FieldType.vec4u,
        views1: FieldType.vec4u,
        views2: FieldType.vec4u,
        views3: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);

/**
 * Por desenho de um grupo das páginas: o grupo (o trecho dos pares dele em `sp_pairs` vem da GPU); na malha grande em
 * aglomerados, o início e o teto da lista dos pares (aglomerado, par) em `sp_scratch` e os índices da malha — a
 * capacidade e, na malha cuja contagem vem da GPU (a adaptativa), a palavra do `sp_scratch` com a do quadro
 * (`countWord`; 0 = a capacidade vale).
 */
export const ShadowGroupDrawSchema = new StructSchema(
    'ShadowGroupDraw',
    {
        group: FieldType.u32,
        listBase: FieldType.u32,
        listCap: FieldType.u32,
        indexCount: FieldType.u32,
        countWord: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Por despacho da caixa de uma geometria: o grupo dela; na malha grande em aglomerados (triângulos seguidos nos
 * índices), o primeiro aglomerado (as caixas de todos em seção do `sp_scratch`), quantos e os índices da malha (a
 * capacidade e a palavra da contagem do quadro, como em `ShadowGroupDraw`).
 */
export const ShadowBoundsGeometrySchema = new StructSchema(
    'ShadowBoundsGeometry',
    {
        group: FieldType.u32,
        clusterFirst: FieldType.u32,
        clusterCount: FieldType.u32,
        indexCount: FieldType.u32,
        countWord: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Por despacho de uma fonte de sprites que projetam (spec 034): os pontos (o primeiro registro, quantos, o passo e a
 * posição em palavras), a instância (a matriz de mundo; `NONE` no corpo de partículas), o lugar na série dos
 * retângulos, se a fonte se move sozinha e o raio dos sprites.
 */
export const ShadowSpriteSourceSchema = new StructSchema(
    'ShadowSpriteSource',
    {
        first: FieldType.u32,
        count: FieldType.u32,
        strideWords: FieldType.u32,
        posOffsetWords: FieldType.u32,
        instance: FieldType.u32,
        rectSlot: FieldType.u32,
        dynamic: FieldType.u32,
        radius: FieldType.f32,
    },
    { addressSpace: 'uniform' },
);

/** As vistas de sombra vivas nos parâmetros de um estágio (`ShadowPagesParams`, `ShadowRequestParams`). */
export interface ShadowViewSlots {
    /** O maior índice de vista viva mais um. */
    readonly viewSpan: number;
    /** Um bit por vista viva. */
    readonly liveMask: number;
    /** O slot do referencial de cada vista no pool `ShadowMatrix` (0 nas que não estão vivas), quatro por vetor. */
    readonly views0: readonly number[];
    readonly views1: readonly number[];
    readonly views2: readonly number[];
    readonly views3: readonly number[];
    /** Qual das vistas do referencial cada vista é (0 no de uma vista; a face do cubo na pontual): 4 bits por vista. */
    readonly faces0: number;
    readonly faces1: number;
}

/**
 * Os campos das vistas de sombra de um estágio: `slots` leva o índice da vista (a faixa no atlas, menor que 16) ao slot
 * do referencial dela e a qual das vistas do referencial ela é (`face`).
 */
export function shadowViewSlots(
    slots: ReadonlyMap<number, { readonly slot: number; readonly face: number }>,
): ShadowViewSlots {
    const all = Array.from({ length: 16 }, (_, v) => slots.get(v)?.slot ?? 0);
    let liveMask = 0;
    let viewSpan = 0;
    const faces = [0, 0];
    for (const [v, { face }] of slots) {
        liveMask |= 1 << v;
        viewSpan = Math.max(viewSpan, v + 1);
        faces[v >> 3] = (faces[v >> 3]! | (face << ((v & 7) * 4))) >>> 0;
    }
    return {
        viewSpan,
        liveMask: liveMask >>> 0,
        views0: all.slice(0, 4),
        views1: all.slice(4, 8),
        views2: all.slice(8, 12),
        views3: all.slice(12, 16),
        faces0: faces[0]!,
        faces1: faces[1]!,
    };
}

/**
 * Pedidos de páginas (spec 013: todas as vistas vivas num passe): o slot da câmera no pool das matrizes; as vistas de
 * sombra pelo índice da faixa — `viewSpan` (o maior índice vivo mais um), `liveMask` (um bit por vista viva) e
 * `views0`–`views3` (o slot do referencial de cada uma no pool `ShadowMatrix`); e as palavras dos pedidos de uma faixa
 * (`stripWords`: o que o esvaziamento percorre por vista).
 */
export const ShadowRequestParamsSchema = new StructSchema(
    'ShadowRequestParams',
    {
        cameraSlot: FieldType.u32,
        viewSpan: FieldType.u32,
        liveMask: FieldType.u32,
        stripWords: FieldType.u32,
        faces0: FieldType.u32,
        faces1: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
        views0: FieldType.vec4u,
        views1: FieldType.vec4u,
        views2: FieldType.vec4u,
        views3: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);

/**
 * Lista de instâncias do passe de sombra (spec 007): por instância de um grupo (geometria, orientação), o slot da
 * entidade no pool `WorldTransform`; o shader lê `worlds[instances[instance_index].world]`.
 */
export const ShadowInstanceSchema = new StructSchema('ShadowInstance', { world: FieldType.u32 });

/** Parâmetros de um efeito de pós: `p0 = (strength, aux0, aux1, aux2)`. */
export const EffectParamsSchema = new StructSchema(
    'EffectParams',
    { p0: FieldType.vec4f },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros da apresentação (spec 011): operador (`toneOperator`: 0 AgX, 1 ACES, 2 neutro, 3 linear), exposição linear (2^EV),
 * pontilhamento (0/1) e saída (0 padrão, 1 HDR estendido).
 */
export const PresentationParamsSchema = new StructSchema(
    'PresentationParams',
    {
        toneOperator: FieldType.u32,
        exposure: FieldType.f32,
        dither: FieldType.u32,
        output: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/**
 * Parâmetros da resolução temporal (spec 034): slot da câmera ativa no pool `CameraMatrices` e o modo (1 temporal,
 * 3 acumulação).
 */
export const TemporalResolveParamsSchema = new StructSchema(
    'TemporalResolveParams',
    {
        cameraSlot: FieldType.u32,
        mode: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Tamanho da tela em pixels (UI). */
export const ScreenParamsSchema = new StructSchema(
    'ScreenParams',
    { size: FieldType.vec2f, _pad: FieldType.vec2f },
    { addressSpace: 'uniform' },
);

/** Quad de UI: retângulo em pixels, cor pré-multiplicada, UV do atlas e flag de textura. */
export const UiQuadSchema = new StructSchema('UiQuad', {
    rect: FieldType.vec4f,
    color: FieldType.vec4f,
    uv: FieldType.vec4f,
    textured: FieldType.vec4f,
});

/**
 * Parâmetros do descarte do desenho principal no quadro (spec 034, T060d): `counts` = (slot da câmera ativa, posições da
 * lista de instâncias, grupos, bits — o descarte ligado, a hierarquia do quadro anterior valendo); `hzb` = (lados do
 * nível 0, níveis, 0).
 */
export const DrawCullParamsSchema = new StructSchema(
    'DrawCullParams',
    { counts: FieldType.vec4u, hzb: FieldType.vec4u },
    { addressSpace: 'uniform' },
);

/**
 * Por despacho do descarte: `value` = o grupo da caixa, a lista (0 ou 1) das listas e argumentos, o nível da hierarquia
 * — ou, na soma de prefixos, (lista, nível); `scan` = (elementos do nível, início dele e do de cima nos níveis da soma).
 */
export const DrawCullStepSchema = new StructSchema(
    'DrawCullStep',
    { value: FieldType.vec4u, scan: FieldType.vec4u },
    { addressSpace: 'uniform' },
);

/**
 * O Resource de trabalho do `ForwardFlow` (spec 039), pelo schema: as séries do descarte (spec 034, T060d) são canais
 * dele, lidos também pelo `ParticleFlow` (a hierarquia de profundidade do quadro).
 */
export const ForwardWorkSchema = new StructSchema('ForwardWork', {});
