import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec 037 (FR-002, SC-002, research R1): cada conta matemática tem uma definição. O teste de símbolo único
// (`wgslSymbols.test.ts`) pega nomes; este pega contas — cada assinatura numérica (os multiplicadores do PCG e de
// Teschner e de Knuth, os pesos de luminância, a curva sRGB, π e 2π literais, a base de Duff, as passagens NDC ↔ uv, a inversa da
// rotação por transposta) só pode aparecer no módulo dono dela. As ocorrências que ainda esperam a migração estão em
// `PENDING` (o inventário, `specs/037-padronizacao-matematica/inventory.md`), por arquivo e contagem: a lista só encolhe
// — uma cópia nova falha, e uma pendência que sumiu também falha até sair da lista.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

type Language = 'wgsl' | 'ts';

interface Signature {
    /** O que a assinatura identifica (a família do inventário). */
    readonly family: string;
    readonly pattern: RegExp;
    /** Os módulos donos (caminhos relativos a `src/`), onde a conta pode aparecer. */
    readonly owners: readonly string[];
    /** Onde procurar: o WGSL sempre; o TypeScript só nas contas com referência da CPU. */
    readonly languages: readonly Language[];
}

/** As assinaturas canônicas (research R1) e os donos. */
const SIGNATURES: Readonly<Record<string, Signature>> = {
    pcg: {
        family: 'Aleatoriedade',
        pattern: /747796405|2891336453|277803737/,
        owners: ['elements/gpu/wgsl/math/random.wgsl', 'elements/math/reference/random.ts'],
        languages: ['wgsl', 'ts'],
    },
    teschner: {
        family: 'Endereçamento',
        pattern: /73856093|19349663|83492791/,
        owners: ['elements/gpu/wgsl/math/hash_address.wgsl'],
        languages: ['wgsl', 'ts'],
    },
    knuth: {
        family: 'Endereçamento',
        pattern: /2654435761/,
        owners: ['elements/gpu/wgsl/math/hash_address.wgsl'],
        languages: ['wgsl', 'ts'],
    },
    rec709: {
        family: 'Cor',
        pattern: /0\.2126\b|0\.7152\b|0\.0722\b/,
        owners: ['elements/gpu/wgsl/math/color.wgsl', 'elements/math/reference/color.ts'],
        languages: ['wgsl', 'ts'],
    },
    bt601: {
        family: 'Cor',
        pattern: /0\.299\b|0\.587\b|0\.114\b/,
        owners: ['elements/gpu/wgsl/math/color.wgsl'],
        languages: ['wgsl', 'ts'],
    },
    srgb: {
        family: 'Cor',
        pattern: /0\.04045\b|0\.0031308\b|12\.92\b/,
        owners: ['elements/gpu/wgsl/math/color.wgsl', 'elements/math/reference/color.ts'],
        languages: ['wgsl', 'ts'],
    },
    pi: {
        family: 'Constantes',
        pattern: /3\.14159|6\.28318|0\.318309/,
        owners: ['elements/gpu/wgsl/math/constants.wgsl'],
        languages: ['wgsl', 'ts'],
    },
    duff: {
        family: 'Bases e amostragem',
        pattern: /1\.0\s*\/\s*\(\s*\w+\s*\+\s*\w+\.z\s*\)/,
        owners: ['elements/gpu/wgsl/math/basis.wgsl'],
        languages: ['wgsl'],
    },
    ndcToUv: {
        family: 'Espaços',
        pattern: /0\.5\s*-\s*[\w.]+(?:\s*\/\s*[\w.]+)?\s*\*\s*0\.5|vec2f\(\s*0\.5\s*,\s*-0\.5\s*\)/,
        owners: ['elements/gpu/wgsl/math/view_space.wgsl'],
        languages: ['wgsl'],
    },
    uvToNdc: {
        family: 'Espaços',
        pattern: /1\.0\s*-\s*\(?[\w.]+(?:\s*\/\s*[\w.()]+)?\)?\s*\*\s*2\.0/,
        owners: ['elements/gpu/wgsl/math/view_space.wgsl'],
        languages: ['wgsl'],
    },
    rotationTranspose: {
        family: 'Transformações',
        pattern: /transpose\(\s*mat3x3f\(/,
        owners: ['elements/gpu/wgsl/math/xform_rigid.wgsl', 'elements/gpu/wgsl/math/linalg.wgsl'],
        languages: ['wgsl'],
    },
};

/**
 * Ocorrências fora do dono que esperam a migração: assinatura → arquivo → contagem. Só encolhe (cada tarefa da 037
 * tira o que migrou e atualiza o inventário).
 */
const PENDING: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    pcg: {},
    teschner: {},
    rec709: {},
    bt601: {},
    srgb: {},
    // Justificadas (T049): o código de usuário de exemplo dos smokes (funções `transform` e `surface`), escrito como o
    // desenvolvedor escreve — o módulo `constants` não é parte do contrato dessas funções.
    pi: {
        '__smokes__/lighting.ts': 1,
        '__smokes__/support/extensionScenes.ts': 2,
    },
    duff: {},
    ndcToUv: {},
    uvToNdc: {},
    rotationTranspose: {},
};

interface SourceFile {
    /** Relativo a `src/`, com `/`. */
    readonly path: string;
    readonly text: string;
}

interface SignatureReport {
    /** Cópias fora do dono e além do que a lista de pendências admite: `assinatura → arquivo:linha`. */
    readonly unexpected: string[];
    /** Pendências cuja contagem caiu (a lista tem de encolher junto): `assinatura → arquivo (lista n, há m)`. */
    readonly stale: string[];
    /** A contagem atual fora do dono (para regravar a lista). */
    readonly counts: Record<string, Record<string, number>>;
}

const languageOf = (path: string): Language | undefined =>
    path.endsWith('.wgsl') ? 'wgsl' : path.endsWith('.ts') ? 'ts' : undefined;

/** O texto sem comentários (as assinaturas citadas em comentário não são contas), linha a linha preservada. */
function code(text: string): string[] {
    const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    return noBlocks.split('\n').map((line) => line.replace(/\/\/.*$/, ''));
}

/** Confere as assinaturas nos arquivos contra os donos e a lista de pendências. */
function checkSignatures(
    files: readonly SourceFile[],
    signatures: Readonly<Record<string, Signature>>,
    pending: Readonly<Record<string, Readonly<Record<string, number>>>>,
): SignatureReport {
    const unexpected: string[] = [];
    const stale: string[] = [];
    const counts: Record<string, Record<string, number>> = {};
    for (const [name, sig] of Object.entries(signatures)) {
        const found: Record<string, number[]> = {};
        for (const file of files) {
            const lang = languageOf(file.path);
            if (
                lang === undefined
                || !sig.languages.includes(lang)
                || sig.owners.includes(file.path)
            )
                continue;
            code(file.text).forEach((line, i) => {
                if (sig.pattern.test(line)) (found[file.path] ??= []).push(i + 1);
            });
        }
        const allowed = pending[name] ?? {};
        for (const [path, lines] of Object.entries(found)) {
            (counts[name] ??= {})[path] = lines.length;
            const limit = allowed[path] ?? 0;
            if (lines.length > limit)
                unexpected.push(
                    `${name} (${sig.family}) → ${path}:${lines.slice(limit).join(',')}`,
                );
        }
        for (const [path, n] of Object.entries(allowed)) {
            const now = found[path]?.length ?? 0;
            if (now < n) stale.push(`${name} → ${path} (lista ${n}, há ${now})`);
        }
    }
    return { unexpected, stale, counts };
}

function sourceFiles(dir: string): SourceFile[] {
    const out: SourceFile[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
            if (entry !== '__tests__' && entry !== 'node_modules') out.push(...sourceFiles(p));
        } else if (
            (entry.endsWith('.wgsl') || entry.endsWith('.ts'))
            && !entry.endsWith('.test.ts')
        ) {
            out.push({ path: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') });
        }
    }
    return out;
}

describe('assinaturas canônicas (spec 037, R1)', () => {
    const report = checkSignatures(sourceFiles(SRC), SIGNATURES, PENDING);

    it('nenhuma conta copiada fora do módulo dono além das pendências do inventário', () => {
        expect(report.unexpected, JSON.stringify(report.counts, null, 1)).toEqual([]);
    });

    it('a lista de pendências só encolhe (o que migrou sai dela)', () => {
        expect(report.stale).toEqual([]);
    });

    it('teste do próprio teste (T006): cópia nova, pendência removida, referência da CPU', () => {
        const sig = { pcg: SIGNATURES.pcg! };
        const owner: SourceFile = {
            path: 'elements/gpu/wgsl/math/random.wgsl',
            text: 'fn pcg_hash(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; return s; }',
        };
        const cpu: SourceFile = {
            path: 'elements/math/reference/random.ts',
            text: 'const s = Math.imul(v, 747796405);',
        };
        const copy: SourceFile = {
            path: 'elements/gpu/wgsl/x/x.wgsl',
            text: '// 747796405 citado em comentário\nfn x_hash(v: u32) -> u32 {\n    return v * 747796405u;\n}',
        };
        const tsCopy: SourceFile = {
            path: '__smokes__/x.ts',
            text: 'const h = Math.imul(v, 277803737);',
        };

        // Dono do WGSL e referência da CPU: nada a apontar.
        expect(checkSignatures([owner, cpu], sig, {})).toMatchObject({ unexpected: [], stale: [] });
        // Cópia nova no WGSL (o comentário não conta) e no TypeScript: apontadas com arquivo e linha.
        expect(checkSignatures([owner, copy, tsCopy], sig, {}).unexpected).toEqual([
            'pcg (Aleatoriedade) → elements/gpu/wgsl/x/x.wgsl:3',
            'pcg (Aleatoriedade) → __smokes__/x.ts:1',
        ]);
        // A cópia listada como pendente passa; uma segunda no mesmo arquivo não.
        expect(
            checkSignatures([copy], sig, { pcg: { 'elements/gpu/wgsl/x/x.wgsl': 1 } }).unexpected,
        ).toEqual([]);
        const twice = {
            ...copy,
            text: `${copy.text}\nfn y(v: u32) -> u32 { return v * 277803737u; }`,
        };
        expect(
            checkSignatures([twice], sig, { pcg: { 'elements/gpu/wgsl/x/x.wgsl': 1 } }).unexpected,
        ).toEqual(['pcg (Aleatoriedade) → elements/gpu/wgsl/x/x.wgsl:5']);
        // Pendência migrada mas ainda na lista: falha até sair dela.
        expect(
            checkSignatures([owner], sig, { pcg: { 'elements/gpu/wgsl/x/x.wgsl': 1 } }).stale,
        ).toEqual(['pcg → elements/gpu/wgsl/x/x.wgsl (lista 1, há 0)']);
        // Uma assinatura WGSL-only não olha o TypeScript.
        const duff = { duff: SIGNATURES.duff! };
        const tsDuff: SourceFile = { path: 'x.ts', text: 'const a = `let a = -1.0 / (s + n.z);`;' };
        expect(checkSignatures([tsDuff], duff, {}).unexpected).toEqual([]);
    });
});
