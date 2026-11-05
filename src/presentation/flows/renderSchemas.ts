import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Parâmetros das páginas do mapa de sombra virtual no quadro (spec 034, T060): o slot do mapa que projeta (no pool
 * `ShadowMap`), os grupos e as instâncias dos desenhos, o orçamento de páginas desenhadas por quadro, o recomeço do
 * cache (`reset`: a série da tabela ou dos retângulos interrompida, os grupos mudados), se os pedidos do quadro anterior
 * valem (senão, a reserva grossa no frustum da câmera do referencial) e as seções do espaço de trabalho (`sp_scratch`, em
 * palavras): as páginas físicas em uso e livres, as filas por nível, as sujas, as dinâmicas, as caixas e os retângulos;
 * os trechos dos pares por grupo (contagem, início, preenchimento) e as necessidades das páginas virtuais; em `sp_groups`, a palavra de grupo de cada instância; nos argumentos, o registro do fundo das
 * páginas sujas (e, no seguinte, o do transporte das que seguem).
 */
export const ShadowPagesParamsSchema = new StructSchema(
    'ShadowPagesParams',
    {
        casterSlot: FieldType.u32,
        groupCount: FieldType.u32,
        instanceCount: FieldType.u32,
        budget: FieldType.u32,
        reset: FieldType.u32,
        requestsValid: FieldType.u32,
        keepBase: FieldType.u32,
        freeBase: FieldType.u32,
        workBase: FieldType.u32,
        dirtyBase: FieldType.u32,
        dynamicBase: FieldType.u32,
        dynamicCap: FieldType.u32,
        boundsBase: FieldType.u32,
        rectsBase: FieldType.u32,
        rectsWidth: FieldType.u32,
        instanceGroupBase: FieldType.u32,
        clearRecord: FieldType.u32,
        groupPairsBase: FieldType.u32,
        needBase: FieldType.u32,
        _pad0: FieldType.u32,
    },
    { addressSpace: 'uniform' },
);

/** Por desenho de um grupo das páginas: o grupo (o trecho dos pares dele em `sp_pairs` vem da GPU). */
export const ShadowGroupDrawSchema = new StructSchema(
    'ShadowGroupDraw',
    { group: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32, _pad2: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/** Por despacho da caixa de uma geometria: o grupo dela. */
export const ShadowBoundsGeometrySchema = new StructSchema(
    'ShadowBoundsGeometry',
    { group: FieldType.u32, _pad0: FieldType.u32, _pad1: FieldType.u32, _pad2: FieldType.u32 },
    { addressSpace: 'uniform' },
);

/** Pedidos de páginas: o slot do mapa que projeta e o da câmera no pool das matrizes. */
export const ShadowRequestParamsSchema = new StructSchema(
    'ShadowRequestParams',
    {
        casterSlot: FieldType.u32,
        cameraSlot: FieldType.u32,
        _pad0: FieldType.u32,
        _pad1: FieldType.u32,
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
