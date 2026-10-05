import type { EnvironmentProfile, PageEnvironment } from './types';

/** Entradas do perfil: o que a página viu + o que o runner sabe (versões, commit, data). */
export interface ProfileInput {
    readonly environment: PageEnvironment;
    readonly resolution: { width: number; height: number };
    readonly versions: { clayflow: string; three: string; rapier: string };
    readonly commit: string;
    readonly date: string;
}

/** Nome, versão completa e versão maior do navegador a partir do user agent. */
export function parseBrowser(userAgent: string): { name: string; version: string; major: number } {
    const patterns: readonly [string, RegExp][] = [
        ['edge', /Edg\/([\d.]+)/],
        ['chrome', /Chrome\/([\d.]+)/],
        ['firefox', /Firefox\/([\d.]+)/],
        ['safari', /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, re] of patterns) {
        const m = re.exec(userAgent);
        if (m?.[1] !== undefined) {
            return { name, version: m[1], major: Number.parseInt(m[1], 10) };
        }
    }
    return { name: 'unknown', version: '0', major: 0 };
}

/** Sistema operacional a partir do user agent. */
export function parseOs(userAgent: string): string {
    if (/Mac OS X|Macintosh/.test(userAgent)) return 'macos';
    if (userAgent.includes('Windows')) return 'windows';
    if (userAgent.includes('Android')) return 'android';
    if (userAgent.includes('CrOS')) return 'chromeos';
    if (userAgent.includes('Linux')) return 'linux';
    return 'unknown';
}

/** Hash FNV-1a de 32 bits em base 36 (6 caracteres) — estável e sem dependências. */
export function shortHash(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).padStart(7, '0').slice(-6);
}

function slug(part: string): string {
    return part
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * `profileId` = slug legível + hash curto dos campos de hardware, navegador (versão maior), SO e
 * resolução (R10). Versões menores do navegador não mudam o id.
 */
export function profileIdOf(
    gpu: EnvironmentProfile['gpu'],
    browser: { name: string; major: number },
    os: string,
    resolution: { width: number; height: number },
): string {
    const device = gpu.device || gpu.architecture || gpu.description || 'gpu';
    const readable = [
        slug(gpu.vendor || 'unknown'),
        slug(device),
        `${browser.name}${browser.major}`,
        os,
        `${resolution.width}x${resolution.height}`,
    ]
        .filter((p) => p.length > 0)
        .join('-');
    const key = JSON.stringify([
        gpu.vendor,
        gpu.architecture,
        gpu.device,
        gpu.description,
        browser.name,
        browser.major,
        os,
        resolution.width,
        resolution.height,
    ]);
    return `${readable}-${shortHash(key)}`;
}

/** Monta o perfil de ambiente de uma execução. */
export function buildProfile(input: ProfileInput): EnvironmentProfile {
    const browser = parseBrowser(input.environment.userAgent);
    const os = parseOs(input.environment.userAgent);
    return {
        profileId: profileIdOf(input.environment.gpu, browser, os, input.resolution),
        gpu: { ...input.environment.gpu },
        browser,
        os,
        resolution: { ...input.resolution },
        devicePixelRatio: input.environment.devicePixelRatio,
        timestampQuery: input.environment.timestampQuery,
        versions: { ...input.versions },
        commit: input.commit,
        date: input.date,
    };
}
