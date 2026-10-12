import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const KERNEL_DIRS = [join(here, '../wgsl/kernels'), join(here, '../compute/wgsl')];
const ELEMENTS = join(here, '../..');

/** Kernels de grupo único (scan dos totais de grupo): despachados com `workgroups(1)`. */
const SINGLE_GROUP_KERNELS = new Set(['scan_top.wgsl']);

function workgroupSizeOf(src: string): number {
    const m = /@workgroup_size\(\s*(\d+)/.exec(src);
    return m?.[1] !== undefined ? Number(m[1]) : 1;
}

function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__tests__') out.push(...tsFiles(p));
        } else if (entry.name.endsWith('.ts')) out.push(p);
    }
    return out;
}

describe('despacho linear (FR-029)', () => {
    const kernels: string[] = KERNEL_DIRS.flatMap((dir) =>
        readdirSync(dir)
            .filter((f) => f.endsWith('.wgsl'))
            .map((f) => relative(ELEMENTS, join(dir, f))),
    );

    it.each(kernels)(
        '%s indexa por num_workgroups quando o grupo tem mais de 1 invocação',
        (path: string) => {
            const src = readFileSync(join(ELEMENTS, path), 'utf8');
            const size = workgroupSizeOf(src);
            if (size === 1 || SINGLE_GROUP_KERNELS.has(path.split('/').pop()!)) return;
            expect(src).toMatch(/@builtin\(num_workgroups\)\s+nwg\s*:\s*vec3u/);
            expect(src).toContain(`gid3.x + gid3.y * nwg.x * ${size}u`);
            // Nenhum uso cru de global_invocation_id fora da reconstrução linear.
            expect(src).not.toMatch(/@builtin\(global_invocation_id\)\s+gid\s*:/);
        },
    );

    it('nenhum Flow de C3 despacha contagem de elementos com workgroups() — só invocations() ou grupo único', () => {
        const offenders: string[] = [];
        for (const file of tsFiles(ELEMENTS)) {
            const src = readFileSync(file, 'utf8');
            for (const m of src.matchAll(/dispatch\s*\.\s*workgroups\(([^)]*)\)/g)) {
                if (m[1]?.trim() !== '1') offenders.push(`${relative(ELEMENTS, file)}: ${m[0]}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
