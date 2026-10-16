import { EXTENSION_PARAMS_CAPACITY } from '../descriptors/ExtensionRecord';
import type { ExtensionParamType, ExtensionParamValue } from './ExtensionParams';

// Parâmetros por nome num registro de extensão (`extensionRecordSchema`: oito `vec4u` com os bits dos escalares) — o
// layout das funções de ponto (spec 009) e dos grafos de conjunto (spec 031).

const SCALAR: Record<ExtensionParamType, ['f' | 'u' | 'i', number]> = {
    f32: ['f', 1],
    u32: ['u', 1],
    i32: ['i', 1],
    vec2f: ['f', 2],
    vec3f: ['f', 3],
    vec4f: ['f', 4],
    vec2u: ['u', 2],
    vec3u: ['u', 3],
    vec4u: ['u', 4],
    vec2i: ['i', 2],
    vec3i: ['i', 3],
    vec4i: ['i', 4],
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Parâmetro com a posição dos seus escalares no registro. */
export interface ParamSlot {
    readonly name: string;
    readonly type: ExtensionParamType;
    readonly kind: 'f' | 'u' | 'i';
    readonly first: number;
    readonly size: number;
}

const bits = new DataView(new ArrayBuffer(4));
function toBits(kind: 'f' | 'u' | 'i', value: number): number {
    if (kind === 'f') bits.setFloat32(0, value, true);
    else if (kind === 'i') bits.setInt32(0, value, true);
    else bits.setUint32(0, value, true);
    return bits.getUint32(0, true);
}
function fromBits(kind: 'f' | 'u' | 'i', raw: number): number {
    bits.setUint32(0, raw, true);
    if (kind === 'f') return bits.getFloat32(0, true);
    if (kind === 'i') return bits.getInt32(0, true);
    return raw;
}

/**
 * Layout de parâmetros num registro de extensão: a posição dos escalares de cada um, na ordem declarada. Valida nomes
 * (identificadores WGSL), tipos e a capacidade do registro.
 *
 * @param owner Nome nas mensagens (o ponto ou o grafo).
 * @throws TypeError nome ou tipo inválido; RangeError acima de `EXTENSION_PARAMS_CAPACITY` escalares.
 */
export function paramSlots(
    owner: string,
    params: Readonly<Record<string, ExtensionParamType>>,
): readonly ParamSlot[] {
    const slots: ParamSlot[] = [];
    let first = 0;
    for (const [name, type] of Object.entries(params)) {
        if (!IDENT.test(name))
            throw new TypeError(`${owner}: parâmetro '${name}' não é um identificador WGSL`);
        // Tipo vindo de JavaScript sem checagem: confere em tempo de execução.
        const s = (SCALAR as Partial<Record<string, ['f' | 'u' | 'i', number]>>)[type];
        if (s === undefined)
            throw new TypeError(`${owner}: parâmetro '${name}' com tipo '${type}' não suportado`);
        slots.push({ name, type, kind: s[0], first, size: s[1] });
        first += s[1];
    }
    if (first > EXTENSION_PARAMS_CAPACITY) {
        throw new RangeError(
            `${owner}: ${first} escalares de parâmetros (máximo ${EXTENSION_PARAMS_CAPACITY})`,
        );
    }
    return Object.freeze(slots);
}

/**
 * Valores por nome sobre os vetores `v0`–`v7` de um registro: ler decodifica os bits; escrever valida (quantidade e
 * finitude) e atribui o vetor inteiro em `write`, para que a C2 veja a mutação e envie o registro.
 *
 * @param read Os vetores atuais (sem disparar mutação).
 * @param write Atribui o vetor `v<k>` (no `data` observado).
 */
export function paramValues(
    owner: string,
    slots: readonly ParamSlot[],
    read: () => Readonly<Record<string, readonly number[]>>,
    write: (vector: number, row: number[]) => void,
): Record<string, ExtensionParamValue> {
    const out: Record<string, ExtensionParamValue> = {};
    for (const s of slots) {
        Object.defineProperty(out, s.name, {
            enumerable: true,
            get: (): ExtensionParamValue => {
                const raw = read();
                const at = (k: number): number =>
                    fromBits(s.kind, raw[`v${Math.floor(k / 4)}`]![k % 4]!);
                return s.size === 1
                    ? at(s.first)
                    : Array.from({ length: s.size }, (_, c) => at(s.first + c));
            },
            set: (value: ExtensionParamValue): void => {
                const list = typeof value === 'number' ? [value] : value;
                if (list.length !== s.size || list.some((v) => !Number.isFinite(v))) {
                    throw new TypeError(
                        `${owner}: '${s.name}' (${s.type}) espera ${s.size} número(s) finito(s)`,
                    );
                }
                const raw = read();
                const next = new Map<number, number[]>();
                for (let c = 0; c < s.size; c++) {
                    const k = s.first + c;
                    const v = Math.floor(k / 4);
                    const row = next.get(v) ?? [...raw[`v${v}`]!];
                    row[k % 4] = toBits(s.kind, list[c]!);
                    next.set(v, row);
                }
                for (const [v, row] of next) write(v, row);
            },
        });
    }
    return Object.freeze(out);
}
