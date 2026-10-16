/** Tipo de um parâmetro de função de ponto. */
export type ExtensionParamType =
    | 'f32'
    | 'u32'
    | 'i32'
    | 'vec2f'
    | 'vec3f'
    | 'vec4f'
    | 'vec2u'
    | 'vec3u'
    | 'vec4u'
    | 'vec2i'
    | 'vec3i'
    | 'vec4i';

/** Valor de um parâmetro: número (escalar) ou lista (vetor). */
export type ExtensionParamValue = number | readonly number[];
