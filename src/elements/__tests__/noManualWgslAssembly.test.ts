import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spec 005 (FR-004, SC-001): todo shader do motor vem da montagem de módulos (`wgslModule` + `composeWgsl`).

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Arquivos que declaram módulos (únicos autorizados a importar `.wgsl`). */
function isModuleFile(rel: string): boolean {
    return (
        /(^|\/)shaders\.ts$/.test(rel)
        || rel.startsWith('elements/gpu/shaders/')
        || rel.startsWith('elements/gpu/compute/')
        || rel.startsWith('elements/physics/shaders/')
    );
}

/** Fora do escopo: C1 (recebe só `ShaderModuleSpec`), testes, smokes, a página de demonstração da C1. */
function isExcluded(rel: string): boolean {
    return (
        rel.startsWith('core/')
        || rel.includes('__tests__/')
        || rel.startsWith('__smokes__/')
        || rel === 'main.ts'
        || rel.endsWith('.d.ts')
    );
}

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) out.push(...tsFiles(p));
        else if (entry.endsWith('.ts')) out.push(p);
    }
    return out;
}

const files = tsFiles(SRC)
    .map((p) => ({ rel: relative(SRC, p).replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }))
    .filter((f) => !isExcluded(f.rel));

describe('nenhuma montagem manual de WGSL', () => {
    it('só arquivos de módulo importam `.wgsl`', () => {
        const offenders = files
            .filter((f) => !isModuleFile(f.rel) && /\.wgsl\?raw['"]/.test(f.src))
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });

    it('nenhum estágio cria spec de shader com texto (vem de composeWgsl)', () => {
        const offenders = files
            .filter(
                (f) => f.rel !== 'scene/shaders/composeWgsl.ts' && /kind:\s*'shader'/.test(f.src),
            )
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });

    it('nenhum descritor ou kernel usa `shaderSource`', () => {
        const offenders = files.filter((f) => /\bshaderSource\b/.test(f.src)).map((f) => f.rel);
        expect(offenders).toEqual([]);
    });

    it('arquivos de módulo não concatenam fontes', () => {
        const offenders = files
            .filter((f) => isModuleFile(f.rel) && /join\(\s*'\\n'\s*\)|\+\s*'\\n'\s*\+/.test(f.src))
            .map((f) => f.rel);
        expect(offenders).toEqual([]);
    });
});
