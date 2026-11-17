import { graphArgument, NodeGraph } from '../../../scene/graph/NodeGraph';
import type { GraphLink, GraphNode } from '../../../scene/graph/NodeGraph';
import { map } from '../../nodes/map';
import { math } from '../../nodes/math';
import { noise } from '../../nodes/noise';

/** Frequências (células por período) do Worley invertido usadas pelos três fBm de Worley. */
const WORLEY = [4, 8, 16, 32, 64] as const;

/**
 * O grafo padrão da forma das nuvens (spec 041, R3; Schneider 2015), todo com ruídos periódicos (`period` = a escala:
 * o volume ladrilha): R = Perlin-Worley — o fBm de gradiente (4 oitavas, período 4) em [0, 1] remapeado para cima pelo
 * fBm de Worley invertido de 4 células (`mix(w, 1, perlin)`) —, G/B/A = fBm de Worley invertido em 4, 8 e 16 células
 * (`0,625·w(f) + 0,25·w(2f) + 0,125·w(4f)`). Espelho de `defaultShape` em `reference/cloudModel.ts`.
 */
export function defaultCloudShapeGraph(): NodeGraph {
    const n: Record<string, GraphNode> = {};
    const links: GraphLink[] = [];
    n.p = graphArgument('p');
    n.perlin = noise.fbm3.with({ scale: 4, octaves: 4, lacunarity: 2, gain: 0.5, period: 4 });
    links.push(['p.value', 'perlin.p']);
    n.perlin01 = map.range.with({ in_min: -1, in_max: 1, out_min: 0, out_max: 1, clamped: 1 });
    links.push(['perlin.value', 'perlin01.x']);
    for (const f of WORLEY) {
        n[`cell${f}`] = noise.cellular3.with({ scale: f, jitter: 1, period: f });
        links.push(['p.value', `cell${f}.p`]);
        n[`w${f}`] = map.range.with({ in_min: 0, in_max: 1, out_min: 1, out_max: 0, clamped: 1 });
        links.push([`cell${f}.f1`, `w${f}.x`]);
    }
    n.k0 = math.value.with({ value: 0.625 });
    n.k1 = math.value.with({ value: 0.25 });
    n.k2 = math.value.with({ value: 0.125 });
    n.one = math.value.with({ value: 1 });
    const fbm = (f: number): string => {
        const id = `fbm${f}`;
        n[`${id}a`] = math.mul;
        links.push([`w${f}.value`, `${id}a.a`], ['k0.value', `${id}a.b`]);
        n[`${id}b`] = math.mul;
        links.push([`w${2 * f}.value`, `${id}b.a`], ['k1.value', `${id}b.b`]);
        n[`${id}c`] = math.mul;
        links.push([`w${4 * f}.value`, `${id}c.a`], ['k2.value', `${id}c.b`]);
        n[`${id}ab`] = math.add;
        links.push([`${id}a.value`, `${id}ab.a`], [`${id}b.value`, `${id}ab.b`]);
        n[id] = math.add;
        links.push([`${id}ab.value`, `${id}.a`], [`${id}c.value`, `${id}.b`]);
        return `${id}.value`;
    };
    const g = fbm(4);
    const b = fbm(8);
    const a = fbm(16);
    n.pw = math.mix;
    links.push([g, 'pw.a'], ['one.value', 'pw.b'], ['perlin01.value', 'pw.t']);
    n.r = math.clamp;
    links.push(['pw.value', 'r.x']);
    n.out = math.combine4;
    links.push(['r.value', 'out.x'], [g, 'out.y'], [b, 'out.z'], [a, 'out.w']);
    return new NodeGraph({
        nodes: n,
        links,
        output: 'out.value',
    });
}
