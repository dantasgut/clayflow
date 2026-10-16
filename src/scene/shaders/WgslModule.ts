import type { StructSchema } from '../descriptors/StructSchema';
import { scanWgslSymbols, stripWgslComments, type WgslSymbol } from './scanWgslSymbols';
import { WgslCompositionError } from './WgslCompositionError';

/**
 * Módulo WGSL: unidade de código de GPU com nome, fonte, dependências (por referência a outros módulos) e os schemas
 * cujos structs usa. Imutável. A montagem (`composeWgsl`) resolve as dependências em ordem topológica, inclui cada
 * módulo uma vez, gera os structs dos schemas e rejeita ciclos, nomes repetidos e símbolos em conflito.
 */
export interface WgslModule {
    /** Identifica o módulo nas mensagens; único dentro de um grafo de montagem. */
    readonly name: string;
    /** Fonte WGSL; pode conter marcadores `{{struct:Nome}}` (uso explícito de um struct gerado). */
    readonly source: string;
    /** Dependências, na ordem em que entram no shader. */
    readonly requires: readonly WgslModule[];
    /** Schemas cujos structs o módulo usa (gerados uma vez por shader). */
    readonly structs: readonly StructSchema[];
    /** Símbolos de nível superior definidos pelo fonte (derivado na criação). */
    readonly symbols: readonly WgslSymbol[];
}

/** Opções de `wgslModule`. */
export interface WgslModuleOptions {
    /** Nome do módulo (não vazio). */
    readonly name: string;
    /** Fonte WGSL. */
    readonly source: string;
    /** Dependências (default nenhuma). */
    readonly requires?: readonly WgslModule[];
    /** Schemas dos structs usados (default nenhum). */
    readonly structs?: readonly StructSchema[];
}

/**
 * Cria um módulo WGSL congelado. Lança se o nome é vazio, se o fonte define o mesmo símbolo duas vezes ou se escreve
 * ligações à mão (`@group`/`@binding` — spec 031: recursos são declarados com `wgslResource`).
 */
export function wgslModule(options: WgslModuleOptions): WgslModule {
    if (options.name.trim().length === 0)
        throw new TypeError('wgslModule: name não pode ser vazio');
    if (/@group\s*\(|@binding\s*\(/.test(stripWgslComments(options.source))) {
        throw new WgslCompositionError(
            'manual-binding',
            `wgslModule '${options.name}': ligação escrita à mão (@group/@binding) — declare o recurso com wgslResource e requeira-o`,
            [options.name],
        );
    }
    const symbols = scanWgslSymbols(options.source);
    const seen = new Set<string>();
    for (const s of symbols) {
        if (seen.has(s.name)) {
            throw new WgslCompositionError(
                'symbol-conflict',
                `wgslModule '${options.name}': símbolo '${s.name}' definido duas vezes`,
                [s.name, options.name],
            );
        }
        seen.add(s.name);
    }
    return Object.freeze({
        name: options.name,
        source: options.source,
        requires: Object.freeze([...(options.requires ?? [])]),
        structs: Object.freeze([...(options.structs ?? [])]),
        symbols: Object.freeze(symbols),
    });
}
