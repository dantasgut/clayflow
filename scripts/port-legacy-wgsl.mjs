#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC_DIR = join(ROOT, 'src/legacy/elements/physics/gpu/wgsl');
const DST_DIR = join(ROOT, 'src/elements/gpu/wgsl');

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const st = statSync(path);
        if (st.isDirectory()) yield* walk(path);
        else if (name.endsWith('.wgsl.ts')) yield path;
    }
}

function extractWgsl(source) {
    // Procura o primeiro template literal — opcionalmente precedido por "/* wgsl */"
    const match = source.match(/=\s*(?:\/\*\s*wgsl\s*\*\/)?\s*`([\s\S]*?)`\s*;?/);
    if (match === null) return null;
    return match[1];
}

let count = 0, skipped = 0;
for (const path of walk(SRC_DIR)) {
    const rel = relative(SRC_DIR, path);
    const dstName = rel.replace(/\.wgsl\.ts$/, '.wgsl');
    const dstPath = join(DST_DIR, dstName);
    const source = readFileSync(path, 'utf8');
    const wgsl = extractWgsl(source);
    if (wgsl === null) { skipped++; continue; }
    const header = `// portado de legacy/elements/physics/gpu/wgsl/${rel}\n`;
    mkdirSync(dirname(dstPath), { recursive: true });
    writeFileSync(dstPath, header + wgsl.trimStart() + (wgsl.endsWith('\n') ? '' : '\n'));
    count++;
}
console.log(`ported ${count} files, skipped ${skipped}`);
