import { isArenaReader, rewriteArenaReads } from './poolArena';
import type { ShaderModuleSpec } from '../../core/contracts/index';
import type { StructSchema } from '../descriptors/StructSchema';
import { stripWgslComments } from './scanWgslSymbols';
import { WGSL_BUILTIN_CALLABLES } from './wgslBuiltins';
import { WgslCompositionError } from './WgslCompositionError';
import type { WgslModule } from './WgslModule';
import {
    BINDING_FREQUENCIES,
    declaredResourceNames,
    isWgslResource,
    resourceDeclarationLine,
    type BindingFrequency,
    type WgslResource,
} from './WgslResource';

/** Ligação atribuída pelo motor a um recurso declarado (spec 031). */
export interface ComposedBinding {
    /** O recurso. */
    readonly resource: WgslResource;
    /** Nome da variável. */
    readonly name: string;
    /** Grupo (posto da frequência entre as presentes). */
    readonly group: number;
    /** Ligação dentro do grupo (ordem do nome). */
    readonly binding: number;
    /** Frequência do recurso. */
    readonly frequency: BindingFrequency;
}

/** Resultado da montagem de um shader a partir de um módulo de entrada. */
export interface ComposedShader {
    /** Spec do shader (congelada; o mesmo objeto para a mesma entrada — identidade e dedup da 004 preservadas). */
    readonly spec: ShaderModuleSpec;
    /** Módulos incluídos, em ordem. */
    readonly modules: readonly string[];
    /** Símbolo → dono (`módulo` ou `struct <wgslName>`). */
    readonly symbols: ReadonlyMap<string, string>;
    /**
     * Linhas de cada módulo no fonte montado (1 = primeira linha; intervalo fechado): traduz a linha de uma mensagem
     * do compilador para a linha no fonte do módulo (`line − first + 1`).
     */
    readonly ranges: ReadonlyMap<string, { readonly first: number; readonly last: number }>;
    /** Ligações dos recursos declarados (spec 031), em ordem de grupo e ligação; vazio em shaders sem recursos. */
    readonly bindings: readonly ComposedBinding[];
    /** Frequência de cada grupo emitido (índice = grupo). */
    readonly groupFrequencies: readonly BindingFrequency[];
}

const MARKER = /\{\{struct:([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
const CALL = /(?<!@)\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const composed = new WeakMap<WgslModule, ComposedShader>();

/**
 * Monta o shader do módulo de entrada: dependências em pós-ordem determinística (irmãos na ordem de `requires`), cada
 * módulo uma vez; no topo, os structs gerados dos schemas usados (com os aninhados antes), cada `wgslName` uma vez;
 * marcadores `{{struct:Nome}}` validados e removidos. Rejeita (`WgslCompositionError`): ciclo, dois módulos distintos
 * com o mesmo nome, símbolo definido em dois lugares, marcador sem schema, dois schemas distintos com o mesmo
 * `wgslName` e layouts diferentes, e chamada a função não definida. Memorizado por módulo de entrada — roda na criação
 * dos recursos de GPU, nunca por quadro.
 */
/** Uma diretiva `enable` numa linha própria. */
const ENABLE_DIRECTIVE = /^[ \t]*enable[ \t]+[A-Za-z0-9_, \t]+;[ \t]*$/gm;

export function composeWgsl(entry: WgslModule): ComposedShader {
    const cached = composed.get(entry);
    if (cached !== undefined) return cached;

    const order = topologicalOrder(entry);
    const schemas = collectSchemas(order);
    const symbols = new Map<string, string>();
    const define = (name: string, owner: string): void => {
        const previous = symbols.get(name);
        if (previous !== undefined) {
            throw new WgslCompositionError(
                'symbol-conflict',
                `composeWgsl('${entry.name}'): símbolo '${name}' definido em ${previous} e em ${owner}`,
                [name, previous, owner],
            );
        }
        symbols.set(name, owner);
    };
    for (const s of schemas) define(s.wgslName, `struct ${s.wgslName}`);
    for (const m of order) for (const sym of m.symbols) define(sym.name, m.name);
    const resources = order.filter(isWgslResource);
    const { bindings, groupFrequencies } = assignBindings(resources);
    checkResourceReferences(order, entry.name);

    const parts: string[] = [];
    const ranges = new Map<string, { first: number; last: number }>();
    let line = 1;
    const push = (text: string): void => {
        parts.push(text);
        // Cada parte é seguida de uma linha em branco (`\n\n` na junção).
        line += text.split('\n').length + 1;
    };
    // Diretivas `enable` dos módulos (ex.: `clip_distances`) vão para o topo, uma vez cada: o WGSL as exige antes de
    // qualquer declaração. No módulo, a linha vira comentário (as faixas de linhas seguem as mesmas).
    const texts = new Map<WgslModule, string>();
    const directives = new Set<string>();
    // As leituras pela arena de pools (T060i): `nome[i]` e `arrayLength(&nome)` viram os acessores do leitor.
    const arenaReads = order.filter(isArenaReader).map((m) => m.arenaRead);
    for (const m of order) {
        if (isWgslResource(m)) continue;
        const marked = resolveMarkers(m, entry.name);
        const read = isArenaReader(m) ? marked : rewriteArenaReads(marked, arenaReads, m.name);
        const text = read.replace(ENABLE_DIRECTIVE, (d: string) => {
            directives.add(d.trim());
            return `// ${d.trim()} (no topo)`;
        });
        texts.set(m, text);
    }
    if (directives.size > 0) push([...directives].join('\n'));
    if (schemas.length > 0) push(schemas.map((s) => s.toWGSL()).join('\n\n'));
    if (bindings.length > 0) {
        push(
            bindings
                .map((b) =>
                    resourceDeclarationLine(b.name, b.resource.resource, b.group, b.binding),
                )
                .join('\n'),
        );
    }
    for (const m of order) {
        if (isWgslResource(m)) continue;
        const text = texts.get(m)!;
        ranges.set(m.name, { first: line, last: line + text.split('\n').length - 1 });
        push(text);
    }
    const source = `${parts.join('\n\n')}\n`;
    checkReferences(source, symbols, entry.name);

    const result: ComposedShader = Object.freeze({
        spec: Object.freeze({ kind: 'shader', discriminator: `wgsl:${entry.name}`, source }),
        modules: Object.freeze(order.map((m) => m.name)),
        symbols,
        ranges,
        bindings: Object.freeze(bindings),
        groupFrequencies: Object.freeze(groupFrequencies),
    });
    composed.set(entry, result);
    return result;
}

/** Pós-ordem determinística; detecta ciclo e nomes repetidos. */
function topologicalOrder(entry: WgslModule): WgslModule[] {
    const order: WgslModule[] = [];
    const done = new Set<WgslModule>();
    const byName = new Map<string, { module: WgslModule; via: string }>();
    const visit = (m: WgslModule, path: readonly WgslModule[], via: string): void => {
        const other = byName.get(m.name);
        if (other !== undefined && other.module !== m && promotes(other.module, m)) {
            // O mesmo recurso lido e escrito no shader (a arena da GPU, T060i): uma ligação só, em leitura e escrita —
            // o WebGPU não aceita o mesmo buffer escrito numa ligação e lido noutra no mesmo despacho.
            if (access(m) === 'read_write') {
                order[order.indexOf(other.module)] = m;
                byName.set(m.name, { module: m, via });
            }
            done.add(m);
            return;
        }
        if (other !== undefined && other.module !== m) {
            throw new WgslCompositionError(
                'duplicate-module-name',
                `composeWgsl('${entry.name}'): dois módulos distintos chamados '${m.name}' (requeridos por ${other.via} e por ${via})`,
                [m.name, other.via, via],
            );
        }
        byName.set(m.name, { module: m, via });
        if (done.has(m)) return;
        if (path.includes(m)) {
            const cycle = [...path.slice(path.indexOf(m)), m].map((x) => x.name);
            throw new WgslCompositionError(
                'cycle',
                `composeWgsl('${entry.name}'): dependência circular ${cycle.join(' → ')}`,
                cycle,
            );
        }
        for (const dep of m.requires) visit(dep, [...path, m], m.name);
        done.add(m);
        order.push(m);
    };
    visit(entry, [], '(entrada)');
    return order;
}

/** O acesso de storage de um recurso declarado (`undefined` fora de storage). */
function access(m: WgslModule): string | undefined {
    if (!isWgslResource(m)) return undefined;
    const b = m.resource.binding as { readonly storage?: string };
    return b.storage;
}

/**
 * `a` e `b` são o mesmo recurso, um em leitura e o outro em leitura e escrita (o mesmo nome, tipo, frequência e
 * fornecedor)? A montagem fica com o de leitura e escrita.
 */
function promotes(a: WgslModule, b: WgslModule): boolean {
    if (!isWgslResource(a) || !isWgslResource(b)) return false;
    const modes = new Set([access(a), access(b)]);
    if (!modes.has('read') || !modes.has('read_write')) return false;
    const same = (x: unknown, y: unknown): boolean => JSON.stringify(x) === JSON.stringify(y);
    return (
        same(a.resource.type, b.resource.type)
        && a.resource.frequency === b.resource.frequency
        && same(a.resource.provider, b.resource.provider)
    );
}

/** Schemas usados pelos módulos (aninhados antes), deduplicados por `wgslName`. */
function collectSchemas(order: readonly WgslModule[]): StructSchema[] {
    const out: StructSchema[] = [];
    const byName = new Map<string, StructSchema>();
    const add = (s: StructSchema): void => {
        const previous = byName.get(s.wgslName);
        if (previous === s) return;
        if (previous !== undefined) {
            if (previous.toWGSL() === s.toWGSL()) return;
            throw new WgslCompositionError(
                'struct-conflict',
                `composeWgsl: schemas '${previous.name}' e '${s.name}' geram o struct '${s.wgslName}' com layouts diferentes`,
                [s.wgslName, previous.name, s.name],
            );
        }
        byName.set(s.wgslName, s);
        out.push(s);
    };
    for (const m of order) {
        for (const s of m.structs) {
            for (const dep of s.dependencies) add(dep);
            add(s);
        }
    }
    return out;
}

/** Nomes de struct que um módulo alcança: os seus schemas, os das dependências (transitivas) e os aninhados. */
function reachableStructs(
    m: WgslModule,
    out = new Set<string>(),
    seen = new Set<WgslModule>(),
): Set<string> {
    if (seen.has(m)) return out;
    seen.add(m);
    for (const s of m.structs) {
        out.add(s.wgslName);
        for (const dep of s.dependencies) out.add(dep.wgslName);
    }
    for (const dep of m.requires) reachableStructs(dep, out, seen);
    return out;
}

function resolveMarkers(m: WgslModule, entryName: string): string {
    if (!m.source.includes('{{struct:')) return m.source;
    const reachable = reachableStructs(m);
    return m.source.replace(MARKER, (_, name: string) => {
        if (!reachable.has(name)) {
            throw new WgslCompositionError(
                'struct-marker',
                `composeWgsl('${entryName}'): o módulo '${m.name}' marca {{struct:${name}}} sem schema com esse wgslName em structs (nem nas dependências)`,
                [name, m.name],
            );
        }
        return '';
    });
}

function checkReferences(
    source: string,
    symbols: ReadonlyMap<string, string>,
    entryName: string,
): void {
    const missing = new Set<string>();
    for (const match of stripWgslComments(source).matchAll(CALL)) {
        const name = match[1]!;
        if (!WGSL_BUILTIN_CALLABLES.has(name) && !symbols.has(name)) missing.add(name);
    }
    if (missing.size > 0) {
        const names = [...missing];
        throw new WgslCompositionError(
            'unresolved-reference',
            `composeWgsl('${entryName}'): chamada a '${names.join("', '")}' sem definição — falta um módulo em requires?`,
            names,
        );
    }
}

/** Grupo = posto da frequência entre as presentes; ligação = ordem do nome dentro do grupo. Determinístico. */
function assignBindings(resources: readonly WgslResource[]): {
    bindings: ComposedBinding[];
    groupFrequencies: BindingFrequency[];
} {
    const present = BINDING_FREQUENCIES.filter((f) =>
        resources.some((r) => r.resource.frequency === f),
    );
    const bindings: ComposedBinding[] = [];
    present.forEach((frequency, group) => {
        const names = resources
            .filter((r) => r.resource.frequency === frequency)
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        names.forEach((resource, binding) => {
            bindings.push({ resource, name: resource.name, group, binding, frequency });
        });
    });
    return { bindings, groupFrequencies: present };
}

const LOCAL_DECLARATION =
    /\b(?:let|var|const)\s+([A-Za-z_][A-Za-z0-9_]*)|(?<![.\w@])([A-Za-z_][A-Za-z0-9_]*)\s*:(?!:)/g;
const IDENT_TOKEN = /(?<![.\w@])[A-Za-z_][A-Za-z0-9_]*\b/g;

/** Módulos alcançados por `m` (ele e as dependências transitivas). */
function closureOf(m: WgslModule, out = new Set<WgslModule>()): Set<WgslModule> {
    if (out.has(m)) return out;
    out.add(m);
    for (const dep of m.requires) closureOf(dep, out);
    return out;
}

/**
 * Um módulo só usa os recursos declarados que alcança pelas suas dependências (spec 031, FR-002): um recurso usado
 * por um módulo que não o requer é um global implícito do hospedeiro — `unresolved-reference`.
 */
function checkResourceReferences(order: readonly WgslModule[], entryName: string): void {
    // Sem recurso declarado, nenhuma referência a conferir (ligações à mão já são rejeitadas por `wgslModule`).
    if (!order.some(isWgslResource)) return;
    const known = declaredResourceNames();
    for (const m of order) {
        if (isWgslResource(m) || m.source.length === 0) continue;
        const reachNames = new Set<string>();
        for (const r of closureOf(m)) {
            if (isWgslResource(r)) reachNames.add(r.name);
            // O nome lido pela arena de pools (T060i): requerido pelo leitor dele.
            else if (isArenaReader(r)) reachNames.add(r.arenaRead.name);
        }
        const code = stripWgslComments(m.source);
        // Nomes declarados no próprio módulo (parâmetros, campos, `let`/`var`/`const` locais e de módulo) sombreiam.
        const local = new Set<string>(m.symbols.map((sym) => sym.name));
        for (const d of code.matchAll(LOCAL_DECLARATION)) local.add(d[1] ?? d[2]!);
        const missing = new Set<string>();
        for (const match of code.matchAll(IDENT_TOKEN)) {
            const name = match[0];
            if (local.has(name) || reachNames.has(name) || !known.has(name)) continue;
            missing.add(name);
        }
        if (missing.size > 0) {
            const names = [...missing];
            throw new WgslCompositionError(
                'unresolved-reference',
                `composeWgsl('${entryName}'): o módulo '${m.name}' usa '${names.join("', '")}' sem requerer o recurso — global implícito do hospedeiro`,
                [m.name, ...names],
            );
        }
    }
}
