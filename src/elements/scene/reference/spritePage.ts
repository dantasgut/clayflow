// Referência em f64 dos sprites que projetam no mapa de sombra virtual (spec 034; só para testes): as regras de
// `ss_pairs_main` (`shadow_pages.wgsl`) e de `shadow_sprite_fs` (`shadow_depth.wgsl`). O sprite é uma esfera de raio
// `r` em volta do centro `c`; vista da luz (o plano xy do espaço da luz, z ao longo dela), um disco. As páginas
// globais `g` de um nível cobrem [g·p − t, (g + 1)·p + t] (lado `p`, borda de 1 texel `t`); o sprite vai às páginas do
// quadrado do disco com a borda. A profundidade guardada num ponto do disco a distância `ρ` do centro é a da face voltada
// para a luz, `z_c − √(r² − ρ²)`: o primeiro ponto da esfera que o raio da luz encontra.

/** Ponto do espaço da luz. */
export type L3 = readonly [number, number, number];

/** As páginas globais (x0, y0, x1, y1, inclusivas) que o quadrado do disco alcança num nível (página `p`, texel `t`). */
export function spritePages(
    center: L3,
    radius: number,
    page: number,
    texel: number,
): [number, number, number, number] {
    const reach = radius + texel;
    return [
        Math.floor((center[0] - reach) / page),
        Math.floor((center[1] - reach) / page),
        Math.floor((center[0] + reach) / page),
        Math.floor((center[1] + reach) / page),
    ];
}

/** O retângulo (x0, y0, x1, y1) da página global `g` com a borda. */
export function pageRect(
    g: readonly [number, number],
    page: number,
    texel: number,
): [number, number, number, number] {
    return [
        g[0] * page - texel,
        g[1] * page - texel,
        (g[0] + 1) * page + texel,
        (g[1] + 1) * page + texel,
    ];
}

/**
 * A profundidade da face da esfera voltada para a luz no ponto `q` do plano da luz, ou `undefined` fora do disco (o
 * fragmento descartado).
 */
export function spriteFrontDepth(
    center: L3,
    radius: number,
    q: readonly [number, number],
): number | undefined {
    const rho = Math.hypot(q[0] - center[0], q[1] - center[1]);
    if (rho > radius) return undefined;
    return center[2] - Math.sqrt(Math.max(radius * radius - rho * rho, 0));
}
