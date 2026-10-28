// Fixtures dos smokes: leitura e gravação de arquivos em `src/__smokes__/fixtures/` pelo runner do bench
// (`npm run smoke -- <nome> [--record]`). O runner expõe `__smokeFixtureRead`/`__smokeFixtureWrite` (base64) à página.
import type { Application } from 'clayflow/web';

declare global {
    interface Window {
        __smokeFixtureRead?: (name: string) => Promise<string | null>;
        __smokeFixtureWrite?: (name: string, base64: string) => Promise<void>;
    }
}

/** `true` quando o runner pediu gravação (`--record` → `?record=1`). */
export function recording(): boolean {
    return new URLSearchParams(location.search).get('record') === '1';
}

/** Perfil da GPU para nomear fixtures (ex.: `apple-metal-3`); trajetória e imagem só se comparam no mesmo perfil. */
export function gpuProfile(app: Application): string {
    const { vendor, architecture } = app.capabilities.adapter;
    const slug = `${vendor}-${architecture}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return slug.replace(/^-+|-+$/g, '') || 'unknown';
}

function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
}

function fromBase64(base64: string): Uint8Array {
    const s = atob(base64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

/** Lê uma fixture; `null` se não existe. Lança se a página não foi aberta pelo runner. */
export async function readFixture(name: string): Promise<Uint8Array | null> {
    const read = window.__smokeFixtureRead;
    if (read === undefined) throw new Error('fixtures exigem o runner (npm run smoke)');
    const base64 = await read(name);
    return base64 === null ? null : fromBase64(base64);
}

/** Grava uma fixture. */
export async function writeFixture(name: string, bytes: Uint8Array): Promise<void> {
    const write = window.__smokeFixtureWrite;
    if (write === undefined) throw new Error('fixtures exigem o runner (npm run smoke)');
    await write(name, toBase64(bytes));
}

/** Lê uma fixture JSON; `null` se não existe. */
export async function readJsonFixture<T>(name: string): Promise<T | null> {
    const bytes = await readFixture(name);
    return bytes === null ? null : (JSON.parse(new TextDecoder().decode(bytes)) as T);
}

/** Grava uma fixture JSON (indentada, para diffs legíveis). */
export async function writeJsonFixture(name: string, value: unknown): Promise<void> {
    await writeFixture(name, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}
