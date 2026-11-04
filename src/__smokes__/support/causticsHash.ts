// O hash das cáusticas lido de volta (spec 034, só nos smokes): a cópia da GPU e a leitura como a do motor
// (`caustics_gather.wgsl`: a soma dos níveis, cada um pela tenda 2D no plano tangente a partir da âncora) — os smokes
// medem a irradiância que o desenho vê, não a de uma célula crua.
import type { Application, StagingBufferSpec } from 'clayflow/web';
import { CAUSTICS_BUCKET_WORDS, CAUSTICS_SLOTS } from '../../elements/lighting/caustics/schemas';

type Vec3 = readonly [number, number, number];
type Rgb = [number, number, number];

/** Palavras do cabeçalho e a âncora nele (`caustics_common.wgsl`: `CAUSTICS_HEADER`, `CAUSTICS_ANCHOR`). */
const HEADER = 12;
const ANCHOR = 8;
/** Níveis (`CAUSTICS_LEVELS`). */
const LEVELS = 6;

/** Um balde ocupado: o nível, a célula (a partir da âncora), o centro em mundo, o lado e a irradiância. */
export interface CausticsBucket {
    readonly level: number;
    readonly cell: Vec3;
    readonly center: Vec3;
    readonly size: number;
    readonly rgb: Rgb;
}

/** O hash lido: a irradiância como o motor a lê e os baldes ocupados. */
export interface CausticsHash {
    readonly cellSize: number;
    readonly anchor: Vec3;
    readonly buckets: readonly CausticsBucket[];
    irradiance(p: Vec3, n: Vec3): Rgb;
}

/** Copia o hash do `Caustics` da GPU e o decodifica. */
export async function readCausticsHash(
    app: Application,
    caustics: Application['defaults']['renderer']['causticsResource'],
): Promise<CausticsHash> {
    const spec = app.resources.bufferOf(caustics, 'hash')!;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'caustics_hash_readback',
        byteSize: spec.byteSize,
    });
    app.core.record('caustics-hash-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const words = new Uint32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    return decodeCausticsHash(words, caustics.cellSize);
}

/** Decodifica as palavras do hash (células do nível fino de lado `cellSize`). */
export function decodeCausticsHash(words: Uint32Array, cellSize: number): CausticsHash {
    const floats = new Float32Array(words.buffer, words.byteOffset, words.length);
    const anchor: Vec3 = [floats[ANCHOR]!, floats[ANCHOR + 1]!, floats[ANCHOR + 2]!];
    const perLevel = Math.floor(CAUSTICS_SLOTS / LEVELS);
    const cells = new Map<string, Rgb>();
    const buckets: CausticsBucket[] = [];
    for (let b = 0; b < LEVELS * perLevel; b++) {
        const w = HEADER + b * CAUSTICS_BUCKET_WORDS;
        if (w + CAUSTICS_BUCKET_WORDS > words.length) break;
        const key = words[w]!;
        if (key === 0) continue;
        const level = Math.floor(b / perLevel);
        const k = key - 1;
        const cell: Vec3 = [
            (k & 2047) - 1024,
            ((k >>> 22) & 1023) - 512,
            ((k >>> 11) & 2047) - 1024,
        ];
        const rgb: Rgb = [floats[w + 4]!, floats[w + 5]!, floats[w + 6]!];
        const size = cellSize * 2 ** level;
        cells.set(`${level}:${cell[0]},${cell[1]},${cell[2]}`, rgb);
        buckets.push({
            level,
            cell,
            size,
            rgb,
            center: [
                anchor[0] + (cell[0] + 0.5) * size,
                anchor[1] + (cell[1] + 0.5) * size,
                anchor[2] + (cell[2] + 0.5) * size,
            ],
        });
    }
    const irradiance = (p: Vec3, n: Vec3): Rgb => {
        const q = [p[0] - anchor[0], p[1] - anchor[1], p[2] - anchor[2]];
        const out: Rgb = [0, 0, 0];
        // A tenda 2D (`caustics_tent`): o eixo dominante da normal é o das camadas.
        const an = n.map(Math.abs);
        const a = an[0]! >= an[1]! && an[0]! >= an[2]! ? 0 : an[1]! >= an[2]! ? 1 : 2;
        const u = (a + 1) % 3;
        const v = (a + 2) % 3;
        for (let level = 0; level < LEVELS; level++) {
            const size = cellSize * 2 ** level;
            const g = q.map((x) => x / size - 0.5);
            const base = g.map(Math.floor);
            const fu = g[u]! - base[u]!;
            const fv = g[v]! - base[v]!;
            const outward = (n[a] >= 0 ? 0.5 : -0.5) * size;
            for (let k = 0; k < 4; k++) {
                const du = k & 1;
                const dv = (k >> 1) & 1;
                const cu = (base[u]! + du + 0.5) * size;
                const cv = (base[v]! + dv + 0.5) * size;
                const h = q[a]! - (n[u]! * (cu - q[u]!) + n[v]! * (cv - q[v]!)) / n[a];
                const c = [...base];
                c[u] = base[u]! + du;
                c[v] = base[v]! + dv;
                c[a] = Math.floor((h + outward) / size);
                const rgb = cells.get(`${level}:${c[0]},${c[1]},${c[2]}`);
                if (rgb === undefined) continue;
                const w = (du ? fu : 1 - fu) * (dv ? fv : 1 - fv);
                for (let i = 0; i < 3; i++) out[i]! += rgb[i]! * w;
            }
        }
        return out;
    };
    return { cellSize, anchor, buckets, irradiance };
}
