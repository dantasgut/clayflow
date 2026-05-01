/**
 * Dev-only WGSL static check.
 *
 * Procura chamadas `fn_name(...)` no source que não tenham uma `fn fn_name(...)`
 * correspondente. Catch barato para concatenações de WGSL incompletas
 * (helpers ausentes em base sources, ordem de concatenação errada).
 *
 * **Não é** um analisador WGSL real — apenas regex sobre o texto. Falsos
 * positivos: keywords (`if`, `for`), built-ins (`textureSample`, `dot`,
 * `length`, etc.) que parecem chamadas. Para evitar ruído, filtramos uma
 * lista de built-ins WGSL comuns. Se um false-positive surgir em build,
 * adicione-o aqui.
 *
 * Em produção (`import.meta.env.DEV !== true`), nunca é chamado — o erro
 * canônico do device.createShaderModule é mais preciso de qualquer forma.
 */

const BUILTIN_FUNCTIONS = new Set([
    // control flow
    'if',
    'else',
    'for',
    'while',
    'switch',
    'case',
    'return',
    'break',
    'continue',
    'discard',
    'loop',
    // declarations
    'fn',
    'var',
    'let',
    'const',
    'override',
    'struct',
    'alias',
    'type',
    // numeric ctors
    'f32',
    'i32',
    'u32',
    'bool',
    'vec2',
    'vec3',
    'vec4',
    'vec2f',
    'vec3f',
    'vec4f',
    'vec2i',
    'vec3i',
    'vec4i',
    'vec2u',
    'vec3u',
    'vec4u',
    'mat2x2',
    'mat2x3',
    'mat2x4',
    'mat3x2',
    'mat3x3',
    'mat3x4',
    'mat4x2',
    'mat4x3',
    'mat4x4',
    'mat2x2f',
    'mat3x3f',
    'mat4x4f',
    'array',
    'atomic',
    'ptr',
    // arithmetic / math
    'abs',
    'min',
    'max',
    'clamp',
    'mix',
    'step',
    'smoothstep',
    'sign',
    'floor',
    'ceil',
    'fract',
    'round',
    'trunc',
    'modf',
    'sqrt',
    'inverseSqrt',
    'rsqrt',
    'pow',
    'exp',
    'exp2',
    'log',
    'log2',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'atan2',
    'sinh',
    'cosh',
    'tanh',
    'radians',
    'degrees',
    'length',
    'distance',
    'normalize',
    'dot',
    'cross',
    'reflect',
    'refract',
    'transpose',
    'determinant',
    'inverse',
    'select',
    'any',
    'all',
    // bit
    'countOneBits',
    'reverseBits',
    'firstLeadingBit',
    'firstTrailingBit',
    'extractBits',
    'insertBits',
    // texture
    'textureSample',
    'textureSampleLevel',
    'textureSampleBias',
    'textureSampleCompare',
    'textureSampleCompareLevel',
    'textureSampleGrad',
    'textureLoad',
    'textureStore',
    'textureDimensions',
    'textureNumLayers',
    'textureNumLevels',
    'textureGather',
    'textureGatherCompare',
    'textureNumSamples',
    // atomic
    'atomicLoad',
    'atomicStore',
    'atomicAdd',
    'atomicSub',
    'atomicMax',
    'atomicMin',
    'atomicAnd',
    'atomicOr',
    'atomicXor',
    'atomicExchange',
    'atomicCompareExchangeWeak',
    // sync
    'storageBarrier',
    'workgroupBarrier',
    'textureBarrier',
    'workgroupUniformLoad',
    // packing
    'pack2x16float',
    'pack2x16snorm',
    'pack2x16unorm',
    'pack4x8snorm',
    'pack4x8unorm',
    'unpack2x16float',
    'unpack2x16snorm',
    'unpack2x16unorm',
    'unpack4x8snorm',
    'unpack4x8unorm',
    // misc
    'bitcast',
    'transpose',
    'fma',
    'frexp',
    'dpdx',
    'dpdy',
    'dpdxFine',
    'dpdyFine',
    'dpdxCoarse',
    'dpdyCoarse',
    'fwidth',
    'arrayLength',
    'saturate',
    'sizeof',
]);

const FN_DEF_REGEX = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[(<]/g;
// Negative lookbehind para `@` exclui atributos WGSL (`@workgroup_size(1)`,
// `@group(0)`, `@binding(0)`, `@location(0)`, `@compute`, `@vertex`, etc.).
const CALL_REGEX = /(?<!@)\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

export function validateWgslReferences(source: string, context: string): void {
    const stripped = stripComments(source);
    const defined = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = FN_DEF_REGEX.exec(stripped)) !== null) {
        defined.add(m[1]!);
    }
    FN_DEF_REGEX.lastIndex = 0;
    const calls = new Set<string>();
    while ((m = CALL_REGEX.exec(stripped)) !== null) {
        calls.add(m[1]!);
    }
    CALL_REGEX.lastIndex = 0;
    const missing: string[] = [];
    for (const c of calls) {
        if (BUILTIN_FUNCTIONS.has(c)) continue;
        if (defined.has(c)) continue;
        missing.push(c);
    }
    if (missing.length > 0) {
        throw new Error(
            `[WGSL] reference to '${missing.join("', '")}' but no fn defined in `
                + `${context}; check baseSrc concatenation order or missing helpers.`,
        );
    }
}

function stripComments(src: string): string {
    return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
