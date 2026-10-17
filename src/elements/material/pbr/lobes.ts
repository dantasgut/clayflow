/**
 * Lobos do fechamento (spec 011, R5) e os bits da máscara de especialização (`CLOSURE_LOBES` no WGSL; os mesmos valores
 * de `CLOSURE_*` em `closure.wgsl`). Os nós de material declaram os lobos que produzem pela marca `lobe:<nome>`.
 */
export const LOBES = {
    diffuse: 1,
    specular: 2,
    coat: 4,
    sheen: 8,
    transmission: 16,
    subsurface: 32,
    emission: 64,
    thinFilm: 128,
    anisotropy: 256,
    opacity: 512,
    translucent: 1024,
} as const;

/** Nome de um lobo. */
export type LobeName = keyof typeof LOBES;

/** Todos os lobos (o avaliador sem especialização). */
export const ALL_LOBES = Object.values(LOBES).reduce((a, b) => a | b, 0);

/** Lobos do fechamento pronto e do adaptador da 009 (`SurfaceParams`): difuso, especular de base e emissão. */
export const PARAMS_LOBES = LOBES.diffuse | LOBES.specular | LOBES.emission;

/** Prefixo das marcas de lobo nos nós (`lobe:diffuse`). */
export const LOBE_TAG = 'lobe:';

/** Máscara dos lobos nomeados. */
export function lobeMask(names: Iterable<string>): number {
    let mask = 0;
    for (const name of names) {
        const bit = (LOBES as Record<string, number>)[name];
        if (bit === undefined)
            throw new TypeError(
                `lobo desconhecido '${name}' (há ${Object.keys(LOBES).join(', ')})`,
            );
        mask |= bit;
    }
    return mask;
}

/** Máscara das marcas `lobe:<nome>` de um conjunto de marcas (as outras são ignoradas). */
export function lobeMaskOfTags(tags: Iterable<string>): number {
    const names: string[] = [];
    for (const tag of tags) if (tag.startsWith(LOBE_TAG)) names.push(tag.slice(LOBE_TAG.length));
    return lobeMask(names);
}
