import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { math } from '../math';

// Tecidos (spec 011, R11): o corpo difuso das fibras mais o brilho de fibra (`bsdf.sheen`, a distribuição "Charlie" de
// Estevez e Kulla 2017, "Production Friendly Microfacet Sheen BRDF": rugosidade baixa = pelo ereto e borda viva, o
// veludo; alta = fibra solta e borda suave, o algodão). As versões sem trama são uniformes; a 012 liga a trama às mesmas
// entradas.

/** Valores de um tecido: cor das fibras, cor (o peso) e rugosidade do brilho de fibra, rugosidade do difuso. */
interface FabricValues {
    readonly color: readonly [number, number, number];
    readonly sheen_color: readonly [number, number, number];
    readonly sheen_roughness: number;
    readonly diffuse_roughness: number;
}

/** Sub-grafo de um tecido: `bsdf.diffuse` somado a `bsdf.sheen` (`closure.add`). */
function fabric(name: string, v: FabricValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                fibers: bsdf.diffuse.with({ color: [...v.color], roughness: v.diffuse_roughness }),
                fuzz: bsdf.sheen.with({ color: [...v.sheen_color], roughness: v.sheen_roughness }),
                out: closure.add,
            },
            links: [
                ['fibers.value', 'out.a'],
                ['fuzz.value', 'out.b'],
            ],
            output: 'out.value',
        }),
        {
            name,
            expose: [
                ['fibers.color', 'color'],
                ['fuzz.color', 'sheen_color'],
                ['fuzz.roughness', 'sheen_roughness'],
                ['fibers.roughness', 'diffuse_roughness'],
            ],
        },
    );
}

/**
 * `material.cotton` — algodão cru: difuso áspero e brilho de fibra fraco e largo (rugosidade 0,9). Parâmetros: `color`,
 * `sheen_color`, `sheen_roughness`, `diffuse_roughness`.
 */
export const cotton = fabric('material.cotton', {
    color: [0.78, 0.75, 0.68],
    sheen_color: [0.25, 0.25, 0.25],
    sheen_roughness: 0.9,
    diffuse_roughness: 1,
});

/**
 * `material.wool` — lã: fibras soltas, brilho de fibra mais forte que o do algodão (0,6) e largo (0,8). Parâmetros: os
 * de `cotton`.
 */
export const wool = fabric('material.wool', {
    color: [0.55, 0.45, 0.35],
    sheen_color: [0.6, 0.6, 0.6],
    sheen_roughness: 0.8,
    diffuse_roughness: 1,
});

/**
 * `material.velvet` — veludo: corpo escuro e brilho de fibra forte e estreito (pelo ereto, rugosidade 0,3) — a borda
 * mais clara que o centro. Parâmetros: os de `cotton`.
 */
export const velvet = fabric('material.velvet', {
    color: [0.2, 0.02, 0.06],
    sheen_color: [1, 0.6, 0.7],
    sheen_roughness: 0.3,
    diffuse_roughness: 1,
});

/**
 * `material.denim` — jeans: sarja de algodão tingida de índigo; brilho de fibra fraco e largo. Parâmetros: os de
 * `cotton`.
 */
export const denim = fabric('material.denim', {
    color: [0.05, 0.09, 0.22],
    sheen_color: [0.2, 0.25, 0.35],
    sheen_roughness: 0.85,
    diffuse_roughness: 1,
});

/**
 * `material.silk` — seda/cetim: o difuso das fibras, um especular de dielétrico anisotrópico (fios lisos e paralelos:
 * IOR 1,56 da fibroína, rugosidade 0,3, anisotropia 0,8 — `research.md` R11) e um brilho de fibra fraco. A tangente é a
 * direção dos fios (0 = a padrão da normal; ligue `geometry.tangentUv`). Parâmetros: `color`, `roughness`,
 * `anisotropy`, `tangent`, `ior`, `sheen_color`, `sheen_roughness`.
 */
export const silk = Subgraph.point(
    new NodeGraph({
        nodes: {
            fibers: bsdf.diffuse.with({ color: [0.75, 0.7, 0.55], roughness: 0.5 }),
            threads: bsdf.dielectric.with({ ior: 1.56, roughness: 0.3, anisotropy: 0.8 }),
            fuzz: bsdf.sheen.with({ color: [0.2, 0.2, 0.2], roughness: 0.5 }),
            body: closure.add,
            out: closure.add,
        },
        links: [
            ['threads.value', 'body.a'],
            ['fibers.value', 'body.b'],
            ['body.value', 'out.a'],
            ['fuzz.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.silk',
        expose: [
            ['fibers.color', 'color'],
            ['threads.roughness', 'roughness'],
            ['threads.anisotropy', 'anisotropy'],
            ['threads.tangent', 'tangent'],
            ['threads.ior', 'ior'],
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
        ],
    },
);

/**
 * `material.sheerFabric` — tecido fino (voile, cortina): parede fina que deixa passar a luz de trás espalhada
 * (`bsdf.translucent`) misturada ao difuso das fibras por `translucency` (0,6: trama aberta), mais um brilho de fibra
 * fraco. A cor vale para os dois. Parâmetros: `color`, `translucency`, `sheen_color`, `sheen_roughness`.
 */
export const sheerFabric = Subgraph.point(
    new NodeGraph({
        nodes: {
            color: math.value3.with({ value: [0.85, 0.82, 0.75] }),
            fibers: bsdf.diffuse.with({ roughness: 1 }),
            through: bsdf.translucent,
            weave: closure.mix.with({ t: 0.6 }),
            fuzz: bsdf.sheen.with({ color: [0.25, 0.25, 0.25], roughness: 0.8 }),
            out: closure.add,
        },
        links: [
            ['color.value', 'fibers.color'],
            ['color.value', 'through.color'],
            ['fibers.value', 'weave.a'],
            ['through.value', 'weave.b'],
            ['weave.value', 'out.a'],
            ['fuzz.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.sheerFabric',
        expose: [
            ['color.value', 'color'],
            ['weave.t', 'translucency'],
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
        ],
    },
);
