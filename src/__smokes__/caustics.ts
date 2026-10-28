// Spec 034 — Smoke das cáusticas unificadas (T067): a luz do sol pela esfera de vidro e pela água até o chão.
//
// Casos (`case=`):
//   - reference (T067a): a referência da CPU pelo traçado a partir da luz (`lightTrace`; gerada offline por
//     `npm run caustics:reference` e gravada em `fixtures/caustics-reference.{json,bin}`, sem perfil de GPU), conferida
//     contra o que se sabe dela: a água parada a 0° e a 30° com a irradiância de Fresnel, Snell e Beer–Lambert por canal
//     a 1 %; a esfera no foco com o máximo no eixo, mais de 20× o chão aceso; a água funda (2 m, espalhamento de Morel)
//     entre o que passa direto e o que passaria sem espalhar; e o ruído da própria referência (a diferença das duas
//     metades) ≤ 1 % por célula na esfera e ≤ 2 % na água. Grava mapas de calor de cada caso (`zz-caustics-*.png`,
//     fora do commit) para ver.
//   - gi (T067b, medida): os fótons da iluminação global (`gi_photon_*`) na esfera de vidro a `factor` vezes a
//     distância focal (`factor=0.8|1|1.2`, uma por execução), lidos do hash (células de 5 mm com as sondas a 8 cm) e
//     somados à luz direta fora da sombra da esfera, contra a referência na grade dela (1 cm): o fluxo no receptor e
//     dentro da sombra, o pico, o erro do padrão (L1 relativo dentro da sombra), a variação entre quadros e o custo dos
//     fótons (relógio de parede de 60 quadros com as cáusticas ligadas e desligadas). Só mede (sem critério): a escolha
//     do caminho é a T067b.
//
// Para rodar: `npm run smoke -- caustics [--query case=reference]`. Resultado: `CAUSTICS SMOKE PASSED` ou `FAIL: …`.
import {
    GlobalIllumination,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type Application,
    type StagingBufferSpec,
} from 'clayflow';
import { CAUSTIC_CASES, CAUSTIC_SPHERE, CAUSTIC_SUN, CAUSTIC_WATER } from './support/causticScenes';
import { settle } from './support/extensionScenes';
import { readFixture, readJsonFixture, writeFixture } from './support/fixtures';
import { buildGiScene, giApp } from './support/giScenes';
import { closureFn } from './support/materialScenes';

function log(msg: string): void {
    console.log(`[caustics] ${msg}`);
    const el = document.getElementById('log');
    if (el !== null) el.textContent += `${msg}\n`;
}

const failures: string[] = [];
function check(ok: boolean, msg: string): void {
    if (!ok) failures.push(msg);
}

interface ReferenceEntry {
    readonly name: string;
    readonly nx: number;
    readonly ny: number;
    readonly open: number;
    readonly strata: number;
    readonly noise: readonly [number, number, number];
    readonly offset: number;
}

/** Fresnel não polarizado da interface ar → n no ângulo `i`. */
function fresnel(i: number, n: number): number {
    if (i === 0) return ((1 - n) / (1 + n)) ** 2;
    const t = Math.asin(Math.sin(i) / n);
    return (
        0.5 * ((Math.sin(i - t) / Math.sin(i + t)) ** 2 + (Math.tan(i - t) / Math.tan(i + t)) ** 2)
    );
}

/** Mapa de calor (luminância relativa ao chão aceso, escala log de 0 a 100×) em PNG. */
async function heatmap(
    rgb: Float32Array,
    nx: number,
    ny: number,
    open: number,
): Promise<Uint8Array> {
    const canvas = new OffscreenCanvas(nx, ny);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(nx, ny);
    for (let i = 0; i < nx * ny; i++) {
        for (let c = 0; c < 3; c++) {
            const v = Math.log10(1 + (9 * rgb[i * 3 + c]!) / open) / 2;
            img.data[i * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, v)));
        }
        img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
}

async function caseReference(): Promise<void> {
    const manifest = await readJsonFixture<{ cases: ReferenceEntry[] }>('caustics-reference.json');
    const bytes = await readFixture('caustics-reference.bin');
    if (manifest === null || bytes === null) {
        failures.push('reference: sem a fixture (rode `npm run caustics:reference`)');
        return;
    }
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const byName = new Map(manifest.cases.map((e) => [e.name, e]));
    const mapOf = (name: string): { e: ReferenceEntry; rgb: Float32Array } => {
        const e = byName.get(name)!;
        return { e, rgb: all.subarray(e.offset, e.offset + e.nx * e.ny * 3) };
    };
    for (const c of CAUSTIC_CASES) {
        const entry = byName.get(c.name);
        check(entry !== undefined, `reference: ${c.name} fora da fixture`);
        if (entry === undefined) continue;
        const { rgb } = mapOf(c.name);
        await writeFixture(
            `zz-caustics-${c.name}.png`,
            await heatmap(rgb, entry.nx, entry.ny, entry.open),
        );
        const limit = c.name.startsWith('sphere') ? 0.01 : 0.02;
        const worst = Math.max(...entry.noise);
        log(
            `reference: ${c.name} — ${entry.strata} estratos, ruído por célula ${entry.noise.map((x) => (100 * x).toFixed(2)).join('/')} % (≤ ${100 * limit} %)`,
        );
        check(
            worst <= limit,
            `reference: ${c.name} com ruído ${(100 * worst).toFixed(2)} % > ${100 * limit} %`,
        );
    }
    const meanOf = (rgb: Float32Array, k: number): number => {
        let s = 0;
        for (let i = k; i < rgb.length; i += 3) s += rgb[i]!;
        return s / (rgb.length / 3);
    };
    // A água parada: o fundo recebe E cos θ (1 − R) exp(−σ h / cos θ_t) (o IOR da linha d; a dispersão mexe < 0,1 %).
    for (const [name, deg] of [
        ['water-still', 0],
        ['water-still-30', 30],
    ] as const) {
        const { e, rgb } = mapOf(name);
        const theta = (deg * Math.PI) / 180;
        const thetaT = Math.asin(Math.sin(theta) / CAUSTIC_WATER.ior);
        const t = 1 - fresnel(theta, CAUSTIC_WATER.ior);
        for (let k = 0; k < 3; k++) {
            const want =
                e.open * t * Math.exp((Math.log(CAUSTIC_WATER.color[k]!) * 0.3) / Math.cos(thetaT));
            const got = meanOf(rgb, k);
            log(
                `reference: ${name} canal ${k} — ${got.toFixed(3)} lx contra ${want.toFixed(3)} (${((100 * (got - want)) / want).toFixed(2)} %)`,
            );
            check(
                Math.abs(got - want) / want <= 0.01,
                `reference: ${name} canal ${k} a ${((100 * (got - want)) / want).toFixed(2)} %`,
            );
        }
    }
    // A esfera no foco: o máximo no eixo (a célula do meio), mais de 20× o chão aceso.
    {
        const { e, rgb } = mapOf('sphere-1.0f');
        let peak = 0;
        let at = -1;
        for (let i = 0; i < e.nx * e.ny; i++) {
            const l = rgb[i * 3 + 1]!;
            if (l > peak) [peak, at] = [l, i];
        }
        const x = at % e.nx;
        const y = Math.floor(at / e.nx);
        log(
            `reference: sphere-1.0f — máximo ${(peak / e.open).toFixed(1)}× o chão aceso na célula (${x}, ${y})`,
        );
        check(
            Math.abs(x - e.nx / 2) <= 1 && Math.abs(y - e.ny / 2) <= 1,
            `reference: o foco fora do eixo (${x}, ${y})`,
        );
        check(
            peak > 20 * e.open,
            `reference: o foco a ${(peak / e.open).toFixed(1)}× o chão aceso`,
        );
    }
    // A água funda: entre o que atravessa sem espalhar e o que atravessaria só com a absorção.
    {
        const { e, rgb } = mapOf('water-deep');
        const t = 1 - fresnel(0, CAUSTIC_WATER.ior);
        for (let k = 0; k < 3; k++) {
            const absorb = Math.log(CAUSTIC_WATER.color[k]!) * 2;
            const direct = e.open * t * Math.exp(absorb - CAUSTIC_WATER.scattering[k]! * 2);
            const clear = e.open * t * Math.exp(absorb);
            const got = meanOf(rgb, k);
            log(
                `reference: water-deep canal ${k} — ${got.toFixed(3)} lx entre ${direct.toFixed(3)} e ${clear.toFixed(3)}`,
            );
            check(
                got >= direct * 0.995 && got <= clear * 1.005,
                `reference: water-deep canal ${k} fora de [${direct}, ${clear}] (${got})`,
            );
        }
    }
}

/** O vidro das cenas (IOR pela função `material`). */
const GLASS = `return closure_add(
        closure_dielectric(data.ior, vec3f(1.0), 0.0, 0.0, vec3f(0.0)),
        closure_transmission(data.ior, vec3f(1.0), 0.0, 0.0, 0.0),
    );`;

/** Espera a iluminação global ficar pronta (`globalIlluminationReady` sem revisão nova por 1 s). */
async function giReady(app: Application, ready: { revision: number; at: number }): Promise<void> {
    const limit = performance.now() + 40_000;
    while (ready.revision < 0 || performance.now() - ready.at < 1000) {
        if (performance.now() > limit)
            throw new Error('a iluminação global não ficou pronta em 40 s');
        await settle(app, 100);
    }
}

/** A irradiância das cáusticas por célula do hash (chave `x,y,z` em células; rgb). */
async function hashCells(
    app: Application,
    gi: GlobalIllumination,
): Promise<Map<string, [number, number, number]>> {
    const spec = app.resources.bufferOf(gi, 'caustics')!;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: 'caustics_gi_readback',
        byteSize: spec.byteSize,
    });
    app.core.record('caustics-gi-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const words = new Uint32Array(await app.core.readback(staging));
    const floats = new Float32Array(words.buffer);
    app.core.destroy(staging);
    const cells = new Map<string, [number, number, number]>();
    for (let w = 8; w + 8 <= words.length; w += 8) {
        const key = words[w]!;
        if (key === 0) continue;
        const k = key - 1;
        cells.set(`${(k & 1023) - 512},${((k >> 10) & 1023) - 512},${((k >> 20) & 1023) - 512}`, [
            floats[w + 4]!,
            floats[w + 5]!,
            floats[w + 6]!,
        ]);
    }
    return cells;
}

/**
 * A irradiância no chão (y = 0) pela GI na grade da referência (`n` × `n` células de lado `size`): a cáustica pela
 * leitura trilinear do hash (a média das camadas de células acima e abaixo do chão, nas células do hash dentro da
 * célula da grade) mais a luz direta do sol fora da sombra geométrica da esfera (a fração da célula fora do disco de
 * raio R, por 10 × 10 subamostras).
 */
function engineGrid(
    cells: Map<string, [number, number, number]>,
    hashCell: number,
    size: number,
    n: number,
): Float32Array {
    const out = new Float32Array(n * n * 3);
    const cell = size / n;
    const sub = Math.max(1, Math.round(cell / hashCell));
    const r = CAUSTIC_SPHERE.radius;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
            const x0 = -size / 2 + i * cell;
            const z0 = -size / 2 + j * cell;
            const e = [0, 0, 0];
            for (let b = 0; b < sub; b++)
                for (let a = 0; a < sub; a++) {
                    const cx = Math.floor((x0 + (a + 0.5) * hashCell) / hashCell);
                    const cz = Math.floor((z0 + (b + 0.5) * hashCell) / hashCell);
                    for (const cy of [-1, 0]) {
                        const v = cells.get(`${cx},${cy},${cz}`);
                        if (v !== undefined)
                            for (let k = 0; k < 3; k++) e[k]! += v[k]! / (2 * sub * sub);
                    }
                }
            let lit = 0;
            for (let b = 0; b < 10; b++)
                for (let a = 0; a < 10; a++) {
                    const x = x0 + ((a + 0.5) / 10) * cell;
                    const z = z0 + ((b + 0.5) / 10) * cell;
                    if (x * x + z * z >= r * r) lit++;
                }
            for (let k = 0; k < 3; k++)
                out[(j * n + i) * 3 + k] = e[k]! + (CAUSTIC_SUN * lit) / 100;
        }
    return out;
}

async function caseGi(): Promise<void> {
    const query = new URLSearchParams(location.search);
    const factor = Number(query.get('factor') ?? '1');
    const spacing = Number(query.get('spacing') ?? '0.08');
    const name = `sphere-${factor.toFixed(1)}f`;
    const manifest = await readJsonFixture<{ cases: ReferenceEntry[] }>('caustics-reference.json');
    const bytes = await readFixture('caustics-reference.bin');
    const entry = manifest?.cases.find((e) => e.name === name);
    if (entry === undefined || bytes === null) {
        failures.push(`gi: sem a referência de ${name}`);
        return;
    }
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const ref = all.subarray(entry.offset, entry.offset + entry.nx * entry.ny * 3);
    const errors: string[] = [];
    const { app, canvas } = await giApp(320, 200, errors);
    const ready = { revision: -1, at: 0 };
    app.events.on('globalIlluminationReady', (e) => {
        ready.revision = e.revision;
        ready.at = performance.now();
    });
    buildGiScene(
        app,
        {
            slabs: [{ id: 1, min: [-2, -0.05, -2], max: [2, 0, 2], color: [0.8, 0.8, 0.8] }],
            sun: { direction: [0, -1, 0], illuminance: CAUSTIC_SUN },
            camera: { position: [0, 0.12, 1.6], target: [0, 0.01, 0], fovY: Math.PI / 5 },
            probeCenter: [0, 0.5, 0],
            probeSpacing: spacing,
            regions: new Map([[1, 'chão']]),
        },
        320 / 200,
    );
    const { radius, ior, focal } = CAUSTIC_SPHERE;
    app.world.insert(
        new SphereGeometry({
            radius,
            latSegments: Number(query.get('lat') ?? '96'),
            lonSegments: 2 * Number(query.get('lat') ?? '96'),
        })
            .add(new StandardMaterial())
            .add(new Transform({ position: [0, factor * focal, 0, 1] }))
            .add(closureFn(GLASS, ['specular', 'transmission'], { ior: 'f32' }, { ior })),
    );
    const gi = new GlobalIllumination({
        quality: 'high',
        bounces: 1,
        probeSpacing: spacing,
        cascades: 1,
        center: [0, 0.5, 0],
    });
    app.world.insert(gi);
    await settle(app, 2500);
    await giReady(app, ready);
    const step = async (frames: number): Promise<void> => {
        for (let i = 0; i < frames; i++) {
            app.step(1 / 60);
            if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
        }
    };
    await step(150);
    const hashCell = spacing / 16;
    const raw = await hashCells(app, gi);
    {
        // Diagnóstico: o fluxo de todo o hash por camada y (irradiância × área da célula) contra o que entra na esfera.
        const layers = new Map<number, number>();
        for (const [k, v] of raw) {
            const y = Number(k.split(',')[1]);
            layers.set(y, (layers.get(y) ?? 0) + v[1] * hashCell * hashCell);
        }
        const into = CAUSTIC_SUN * Math.PI * radius * radius;
        log(
            `gi ${name} (sondas a ${spacing} m, células de ${(1000 * hashCell).toFixed(1)} mm): ${raw.size} células; fluxo por camada y ${[
                ...layers.entries(),
            ]
                .sort((p, q) => p[0] - q[0])
                .map(([y, f]) => `${y}: ${(f / into).toFixed(3)}`)
                .join(', ')} (× o que entra na esfera)`,
        );
    }
    const a = engineGrid(raw, hashCell, 0.6, entry.nx);
    await step(10);
    const b = engineGrid(await hashCells(app, gi), hashCell, 0.6, entry.nx);
    // Custo dos fótons: 60 quadros com as cáusticas ligadas e desligadas, pelo relógio de parede (o tempo de GPU por
    // passo não é confiável no Apple), esperando a GPU no fim de cada lote.
    const timed = async (): Promise<number> => {
        await app.core.readback(
            app.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: 'caustics_sync0',
                byteSize: 16,
            }),
        );
        const t0 = performance.now();
        await step(60);
        await app.core.readback(
            app.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: 'caustics_sync1',
                byteSize: 16,
            }),
        );
        return (performance.now() - t0) / 60;
    };
    const on = await timed();
    gi.data.caustics = false;
    await settle(app, 500);
    const off = await timed();
    app.dispose();
    canvas.remove();
    if (errors.length > 0) failures.push(`gi: erros do motor: ${errors.join(' | ')}`);
    // As medidas no canal verde (sem dispersão na esfera: os três iguais).
    const n = entry.nx;
    const cell = 0.6 / n;
    let fluxE = 0;
    let fluxR = 0;
    let diskE = 0;
    let diskR = 0;
    let l1 = 0;
    let change = 0;
    let peakE = 0;
    let peakR = 0;
    for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
            const k = (j * n + i) * 3 + 1;
            const x = -0.3 + (i + 0.5) * cell;
            const z = -0.3 + (j + 0.5) * cell;
            fluxE += a[k]! * cell * cell;
            fluxR += ref[k]! * cell * cell;
            peakE = Math.max(peakE, a[k]!);
            peakR = Math.max(peakR, ref[k]!);
            if (x * x + z * z < radius * radius) {
                diskE += a[k]! * cell * cell;
                diskR += ref[k]! * cell * cell;
                l1 += Math.abs(a[k]! - ref[k]!);
                change += Math.abs(b[k]! - a[k]!);
            }
        }
    const diskSum = diskR / (cell * cell);
    log(
        `gi ${name}: fluxo no receptor ${(fluxE / fluxR).toFixed(4)}× a referência, dentro da sombra ${(diskE / diskR).toFixed(3)}×; pico ${(peakE / CAUSTIC_SUN).toFixed(1)}× o chão aceso (referência ${(peakR / CAUSTIC_SUN).toFixed(1)}×); erro do padrão na sombra ${((100 * l1) / diskSum).toFixed(1)} %; variação em 10 quadros ${((100 * change) / (diskE / (cell * cell))).toFixed(2)} %; custo dos fótons ${(on - off).toFixed(2)} ms/quadro (${on.toFixed(2)} contra ${off.toFixed(2)})`,
    );
    await writeFixture(`zz-caustics-gi-${name}.png`, await heatmap(a, n, n, CAUSTIC_SUN));
}

const CASES: Record<string, () => Promise<void>> = { reference: caseReference, gi: caseGi };

async function main(): Promise<void> {
    const only = new URLSearchParams(location.search).get('case');
    for (const [name, run] of Object.entries(CASES)) {
        // As medidas do motor só a pedido (uma por execução, pelo teto de tempo).
        if (only === null ? name !== 'reference' : only !== name) continue;
        await run();
    }
    if (failures.length > 0) log(`FAIL: ${failures.join(' | ')}`);
    else log('CAUSTICS SMOKE PASSED');
}

main().catch((err: unknown) => {
    log(`FAIL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
});
