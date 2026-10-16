import { FieldType } from '../descriptors/FieldType';
import type { ExtensionParamType, ExtensionParamValue } from './ExtensionParams';

// Parâmetros por nome das funções de ponto (spec 009) e dos grafos de nós (spec 031): campos tipados de um registro
// (research R8) — cada parâmetro é um campo com o seu tipo no struct gerado, sem bits e sem teto de escalares.

/** Escalares de cada tipo de parâmetro. */
const SIZE: Readonly<Record<ExtensionParamType, number>> = {
    f32: 1,
    u32: 1,
    i32: 1,
    vec2f: 2,
    vec3f: 3,
    vec4f: 4,
    vec2u: 2,
    vec3u: 3,
    vec4u: 4,
    vec2i: 2,
    vec3i: 3,
    vec4i: 4,
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Campos do registro dos parâmetros (nome → tipo do campo), na ordem declarada. Valida nomes (identificadores WGSL,
 * fora de `reserved`) e tipos.
 *
 * @param owner Nome nas mensagens (o ponto ou o grafo).
 * @param reserved Nomes de campos que o registro já usa (ex.: `revision`).
 * @throws TypeError nome inválido ou reservado, ou tipo não suportado.
 */
export function paramFields(
    owner: string,
    params: Readonly<Record<string, ExtensionParamType>>,
    reserved: readonly string[] = [],
): Readonly<Record<string, FieldType>> {
    const fields: Record<string, FieldType> = {};
    for (const [name, type] of Object.entries(params)) {
        if (!IDENT.test(name))
            throw new TypeError(`${owner}: parâmetro '${name}' não é um identificador WGSL`);
        if (reserved.includes(name))
            throw new TypeError(`${owner}: parâmetro '${name}' usa um nome reservado do registro`);
        // Tipo vindo de JavaScript sem checagem: confere em tempo de execução.
        if ((SIZE as Partial<Record<string, number>>)[type] === undefined)
            throw new TypeError(`${owner}: parâmetro '${name}' com tipo '${type}' não suportado`);
        fields[name] = FieldType[type];
    }
    return Object.freeze(fields);
}

/**
 * Valores por nome sobre os campos de um registro: ler devolve o número (ou uma cópia do vetor); escrever valida
 * (quantidade e finitude) e atribui o campo inteiro em `write`, para que a C2 veja a mutação e envie o registro.
 *
 * @param read Valor atual do campo (sem disparar mutação).
 * @param write Atribui o campo (no `data` observado).
 */
export function paramValues(
    owner: string,
    params: Readonly<Record<string, ExtensionParamType>>,
    read: (name: string) => unknown,
    write: (name: string, value: number | number[]) => void,
): Record<string, ExtensionParamValue> {
    const out: Record<string, ExtensionParamValue> = {};
    for (const [name, type] of Object.entries(params)) {
        const size = SIZE[type];
        Object.defineProperty(out, name, {
            enumerable: true,
            get: (): ExtensionParamValue => {
                const value = read(name);
                if (size === 1) return value as number;
                return Array.from(value as ArrayLike<number>);
            },
            set: (value: ExtensionParamValue): void => {
                const list = typeof value === 'number' ? [value] : value;
                if (list.length !== size || list.some((v) => !Number.isFinite(v))) {
                    throw new TypeError(
                        `${owner}: '${name}' (${type}) espera ${size} número(s) finito(s)`,
                    );
                }
                write(name, size === 1 ? list[0]! : [...list]);
            },
        });
    }
    return Object.freeze(out);
}
