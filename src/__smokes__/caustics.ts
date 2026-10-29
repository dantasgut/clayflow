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
//   - engine (T067c): o transporte do motor (`Caustics`) na esfera de vidro a `factor` vezes a distância focal
//     (`factor=0.8|1|1.2`, uma por execução; `cell=` o lado da célula do hash, padrão 1 cm; `photons=`, padrão 1 048 576),
//     lido do hash e somado à luz direta fora da sombra da esfera, contra a referência na grade dela (1 cm): o fluxo
//     dentro da sombra a ≤ 5 % (SC-007), no receptor a ≤ 2 %, o erro do padrão (L1 relativo dentro da sombra) ≤ 10 %; e
//     mede o pico, a variação entre quadros e o custo dos fótons (relógio de parede de 60 quadros ligado e desligado).
//     Na T067b (com os fótons ainda na GI): fluxo na sombra a 52 %, pico à metade, padrão a 48 % (`research.md` R14).
//   - water (T067c): o fundo da camada parada a 0° e a 30° — a linha reta mais a correção dos fótons — contra Fresnel,
//     Snell e Beer–Lambert por canal a ≤ 3 %.
//   - shadow (T067c): a sombra da parede no fundo da camada parada com o sol a 60° — a borda na posição da refração
//     (≤ 1,5 cm), não na da linha reta, a faixa entre as duas acesa e a sombra escura (≤ 5 % do nível aceso).
//
// Para rodar: `npm run smoke -- caustics [--query case=reference]`. Resultado: `CAUSTICS SMOKE PASSED` ou `FAIL: …`.
import {
    Caustics,
    SphereGeometry,
    StandardMaterial,
    Transform,
    type Application,
    type StagingBufferSpec,
} from 'clayflow/web';
import { CAUSTIC_CASES, CAUSTIC_SPHERE, CAUSTIC_SUN, CAUSTIC_WATER } from './support/causticScenes';
import { settle } from './support/extensionScenes';
import { readFixture, readJsonFixture, writeFixture } from './support/fixtures';
import { buildGiScene, giApp } from './support/giScenes';
import { waterScene, WATER_SPACING, WATER_TANK } from './support/waterScene';
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

/** A irradiância das cáusticas por célula do hash (chave `x,y,z` em células; rgb). */
async function hashCells(
    app: Application,
    caustics: Caustics,
): Promise<Map<string, [number, number, number]>> {
    const spec = app.resources.bufferOf(caustics, 'hash')!;
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
    // Baldes de 10 palavras; a chave com o nível nos 2 bits de cima (`caustics_common.wgsl`): só o nível fino.
    for (let w = 8; w + 10 <= words.length; w += 10) {
        const key = words[w]!;
        if (key === 0 || (key - 1) >>> 30 !== 0) continue;
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
 * camada do chão do hash (a da tenda 2D do motor), a média das células do hash dentro da célula da grade mais a luz direta do sol fora da sombra geométrica da esfera (a fração da célula fora do disco de
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
                    // A camada do chão na tenda 2D do motor (`gi_photon_tent`): a célula meio passo acima de y = 0.
                    const v = cells.get(`${cx},0,${cz}`);
                    if (v !== undefined) for (let k = 0; k < 3; k++) e[k]! += v[k]! / (sub * sub);
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

async function caseEngine(): Promise<void> {
    const query = new URLSearchParams(location.search);
    const factor = Number(query.get('factor') ?? '1');
    const cellSize = Number(query.get('cell') ?? '0.01');
    const photons = Number(query.get('photons') ?? '1048576');
    const name = `sphere-${factor.toFixed(1)}f`;
    const manifest = await readJsonFixture<{ cases: ReferenceEntry[] }>('caustics-reference.json');
    const bytes = await readFixture('caustics-reference.bin');
    const entry = manifest?.cases.find((e) => e.name === name);
    if (entry === undefined || bytes === null) {
        failures.push(`engine: sem a referência de ${name}`);
        return;
    }
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const ref = all.subarray(entry.offset, entry.offset + entry.nx * entry.ny * 3);
    const errors: string[] = [];
    const { app, canvas } = await giApp(320, 200, errors);
    // O transporte antes do vidro (o padrão dos estágios entraria com o vidro, com as opções padrão).
    const caustics = new Caustics({ cellSize, photons });
    app.world.insert(caustics);
    buildGiScene(
        app,
        {
            slabs: [{ id: 1, min: [-2, -0.05, -2], max: [2, 0, 2], color: [0.8, 0.8, 0.8] }],
            sun: { direction: [0, -1, 0], illuminance: CAUSTIC_SUN },
            camera: { position: [0, 0.12, 1.6], target: [0, 0.01, 0], fovY: Math.PI / 5 },
            probeCenter: [0, 0.5, 0],
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
    await settle(app, 4000);
    const step = async (frames: number): Promise<void> => {
        for (let i = 0; i < frames; i++) {
            app.step(1 / 60);
            if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
        }
    };
    await step(150);
    const hashCell = cellSize;
    const raw = await hashCells(app, caustics);
    {
        // Diagnóstico: o fluxo de todo o hash por camada y (irradiância × área da célula) contra o que entra na esfera.
        const layers = new Map<number, number>();
        for (const [k, v] of raw) {
            const y = Number(k.split(',')[1]);
            layers.set(y, (layers.get(y) ?? 0) + v[1] * hashCell * hashCell);
        }
        const into = CAUSTIC_SUN * Math.PI * radius * radius;
        const far = [0.3, 0.5, 1, 1.5, 2, 3];
        const farAcc = far.map(() => 0);
        for (const [k, v] of raw) {
            const [x, y, z] = k.split(',').map(Number) as [number, number, number];
            if (y !== 0) continue;
            const r = Math.hypot((x + 0.5) * hashCell, (z + 0.5) * hashCell);
            const at = far.findIndex((q) => r < q);
            if (at >= 0) farAcc[at]! += v[1] * hashCell * hashCell;
        }
        log(
            `engine ${name}: fluxo do hash por distância do eixo (× o que entra): ${far.map((q, k) => `<${q}: ${(farAcc[k]! / into).toFixed(3)}`).join('  ')}`,
        );
        log(
            `engine ${name} (células de ${(1000 * hashCell).toFixed(1)} mm): ${raw.size} células; fluxo por camada y ${[
                ...layers.entries(),
            ]
                .sort((p, q) => p[0] - q[0])
                .map(([y, f]) => `${y}: ${(f / into).toFixed(3)}`)
                .join(', ')} (× o que entra na esfera)`,
        );
    }
    const a = engineGrid(raw, hashCell, 0.6, entry.nx);
    await step(10);
    const b = engineGrid(await hashCells(app, caustics), hashCell, 0.6, entry.nx);
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
    caustics.enabled = false;
    await settle(app, 500);
    const off = await timed();
    app.dispose();
    canvas.remove();
    if (errors.length > 0) failures.push(`engine: erros do motor: ${errors.join(' | ')}`);
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
    {
        // O perfil radial da cáustica (a irradiância sem a luz direta), em frações do que entra na esfera.
        const rings = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
        const accE = rings.map(() => 0);
        const accR = rings.map(() => 0);
        for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) {
                const x = -0.3 + (i + 0.5) * cell;
                const z = -0.3 + (j + 0.5) * cell;
                const r = Math.hypot(x, z);
                const k = rings.findIndex((q) => r < q);
                if (k < 0) continue;
                const direct = r >= radius ? CAUSTIC_SUN : 0;
                accE[k]! += (a[(j * n + i) * 3 + 1]! - direct) * cell * cell;
                accR[k]! += (ref[(j * n + i) * 3 + 1]! - direct) * cell * cell;
            }
        const into = CAUSTIC_SUN * Math.PI * radius * radius;
        log(
            `engine ${name}: cáustica por anel (GI / referência, × o que entra): ${rings.map((q, k) => `<${q}: ${(accE[k]! / into).toFixed(3)}/${(accR[k]! / into).toFixed(3)}`).join('  ')}`,
        );
    }
    log(
        `engine ${name}: fluxo no receptor ${(fluxE / fluxR).toFixed(4)}× a referência, dentro da sombra ${(diskE / diskR).toFixed(3)}×; pico ${(peakE / CAUSTIC_SUN).toFixed(1)}× o chão aceso (referência ${(peakR / CAUSTIC_SUN).toFixed(1)}×); erro do padrão na sombra ${((100 * l1) / diskSum).toFixed(1)} %; variação em 10 quadros ${((100 * change) / (diskE / (cell * cell))).toFixed(2)} %; custo dos fótons ${(on - off).toFixed(2)} ms/quadro (${on.toFixed(2)} contra ${off.toFixed(2)})`,
    );
    // A porta da T067c: o fluxo na sombra da esfera a ≤ 5 % (SC-007), no receptor a ≤ 2 %, o padrão a ≤ 10 % (L1).
    check(
        Math.abs(diskE / diskR - 1) <= 0.05,
        `engine: ${name} — fluxo na sombra ${(diskE / diskR).toFixed(3)}× a referência`,
    );
    check(
        Math.abs(fluxE / fluxR - 1) <= 0.02,
        `engine: ${name} — fluxo no receptor ${(fluxE / fluxR).toFixed(4)}× a referência`,
    );
    check(
        l1 / diskSum <= 0.1,
        `engine: ${name} — erro do padrão ${((100 * l1) / diskSum).toFixed(1)} %`,
    );
    await writeFixture(`zz-caustics-engine-${name}.png`, await heatmap(a, n, n, CAUSTIC_SUN));
}

/**
 * A água parada (T067c): a camada do tanque dos smokes sem as ondulações, sol a pino e a 30°; o fundo dentro do tanque
 * (longe das paredes) recebe E cos θ (1 − R(θ)) exp(−σ_c h / cos θ_t) por canal, com o Fresnel da água, a absorção dela
 * (`waterLook`) e a altura pelo volume das partículas sobre a área do tanque — a ≤ 3 % (a superfície das partículas não
 * é plana: o foco das ondulações dela redistribui, a média fica). A luz das fontes chega ao fundo em linha reta
 * (`light_transmission`: E cos θ (1 − R(θ)) exp(−σ_c h / cos θ), o caminho sem a refração) e os fótons a corrigem (o
 * hash guarda a correção): o fundo é a soma — a pino a correção é ~0; a 30° ela leva o trecho mais curto da luz
 * refratada na água.
 */
async function caseWater(): Promise<void> {
    for (const deg of [0, 30]) await waterAt(deg);
}

/** A água parada de `layers` camadas com o sol a `deg` graus no plano xy: as células do chão do hash (ou `undefined`). */
async function waterCells(
    name: string,
    deg: number,
    layers: number,
): Promise<{ cells: Map<string, [number, number, number]>; cell: number } | undefined> {
    const theta = (deg * Math.PI) / 180;
    const errors: string[] = [];
    const { app, canvas } = await giApp(320, 200, errors);
    waterScene(app, {
        width: 320,
        height: 200,
        layer: layers,
        light: [Math.sin(theta), -Math.cos(theta), 0],
        material: { ripple: false },
        // Paredes opacas: a conta exata não tem a luz que atravessa o vidro (nem a sombra dele).
        walls: 'opaque',
        eye: [0, 1.6, 0.4],
        target: [0, 0, 0],
    });
    await app.whenReady({ timeoutMs: 30_000 });
    for (let i = 0; i < 180; i++) {
        app.step(1 / 60);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    const caustics = app.world.findResource(Caustics.schema, Caustics);
    if (caustics === undefined) {
        failures.push(`${name}: sem o \`Caustics\` (os estágios padrão o inserem com a água)`);
        app.dispose();
        canvas.remove();
        return undefined;
    }
    const cells = await hashCells(app, caustics);
    app.dispose();
    canvas.remove();
    if (errors.length > 0) failures.push(`${name}: erros do motor: ${errors.join(' | ')}`);
    return { cells, cell: caustics.cellSize };
}

/** A altura da camada parada de `layers` camadas de partículas (o volume delas na área do tanque). */
function layerHeight(layers: number): number {
    const [hx, hz] = WATER_TANK;
    const s = WATER_SPACING;
    const count = Math.floor((2 * hx) / s) * Math.floor((2 * hz) / s) * layers;
    return (count * s ** 3) / (4 * hx * hz);
}

async function waterAt(deg: number): Promise<void> {
    const theta = (deg * Math.PI) / 180;
    const layers = 12;
    const water = await waterCells(`water ${deg}°`, deg, layers);
    if (water === undefined) return;
    const { cells, cell } = water;
    const [hx, hz] = WATER_TANK;
    const h = layerHeight(layers);
    const ior = 1.333;
    const thetaT = Math.asin(Math.sin(theta) / ior);
    const enter = 1 - fresnel(theta, ior);
    const absorption = [0.45, 0.09, 0.06];
    const sun = 1.2;
    const sum = [0, 0, 0];
    let n = 0;
    for (const [k, v] of cells) {
        const [x, y, z] = k.split(',').map(Number) as [number, number, number];
        if (y !== 0) continue;
        const px = (x + 0.5) * cell;
        const pz = (z + 0.5) * cell;
        if (Math.abs(px) > 0.5 * hx || Math.abs(pz) > 0.5 * hz) continue;
        for (let c = 0; c < 3; c++) sum[c]! += v[c]!;
        n++;
    }
    for (let c = 0; c < 3; c++) {
        const correction = sum[c]! / Math.max(1, n);
        const straight =
            sun * Math.cos(theta) * enter * Math.exp((-absorption[c]! * h) / Math.cos(theta));
        const got = straight + correction;
        const want =
            sun * Math.cos(theta) * enter * Math.exp((-absorption[c]! * h) / Math.cos(thetaT));
        log(
            `water ${deg}°: canal ${c} — fundo ${got.toFixed(4)} (linha reta ${straight.toFixed(4)} + fótons ${correction.toFixed(4)}) contra ${want.toFixed(4)} (${((100 * (got - want)) / want).toFixed(2)} %; h = ${(100 * h).toFixed(1)} cm, ${n} células)`,
        );
        check(
            Math.abs(got / want - 1) <= 0.03,
            `water ${deg}°: canal ${c} a ${((100 * (got - want)) / want).toFixed(2)} %`,
        );
    }
}

/**
 * A sombra da parede debaixo da água (T067c): o sol a 60° no plano xy entra pelo lado −x; a borda de cima da parede −x
 * (0,5 m) faz sombra no fundo da camada parada. A luz refratada desce mais a pino que a linha reta, e a sombra no fundo
 * é mais curta: a borda em −hx + (0,5 − h) tg θ + h tg θt, não em −hx + 0,5 tg θ. O fundo é a linha reta (zero na sombra
 * dela) mais a correção dos fótons, no canal verde, ao longo de x (faixas de 1 cm, a média em |z| < hz/2): a borda (a
 * metade do nível aceso) a ≤ 1,5 cm da refratada; a faixa entre as duas bordas acesa (a ≤ 5 % do nível aceso; a 60° ela tem
 * 26 cm, vários períodos da cáustica do relevo da camada de partículas — ±20 % em faixas de 7,5 cm) e a
 * sombra antes da refratada escura (≤ 5 % dele).
 */
async function caseShadow(): Promise<void> {
    const deg = 60;
    const theta = (deg * Math.PI) / 180;
    const layers = 12;
    const water = await waterCells('shadow', deg, layers);
    if (water === undefined) return;
    const { cells, cell } = water;
    const [hx, hz] = WATER_TANK;
    const h = layerHeight(layers);
    const wall = 0.5;
    const ior = 1.333;
    const thetaT = Math.asin(Math.sin(theta) / ior);
    const sigma = 0.09;
    const base = 1.2 * Math.cos(theta) * (1 - fresnel(theta, ior));
    const lit = base * Math.exp((-sigma * h) / Math.cos(thetaT));
    const straightLit = base * Math.exp((-sigma * h) / Math.cos(theta));
    const straightEdge = -hx + wall * Math.tan(theta);
    const refractedEdge = -hx + (wall - h) * Math.tan(theta) + h * Math.tan(thetaT);
    const bins = new Map<number, { sum: number; n: number }>();
    for (const [k, v] of cells) {
        const [x, y, z] = k.split(',').map(Number) as [number, number, number];
        if (y !== 0 || Math.abs((z + 0.5) * cell) > 0.5 * hz) continue;
        const b = bins.get(x) ?? { sum: 0, n: 0 };
        b.sum += v[1];
        b.n++;
        bins.set(x, b);
    }
    const total = (x: number): number | undefined => {
        const b = bins.get(x);
        const px = (x + 0.5) * cell;
        const straight = px >= straightEdge ? straightLit : 0;
        return straight + (b === undefined ? 0 : b.sum / b.n);
    };
    let edge = Number.NaN;
    const first = Math.ceil(-hx / cell);
    let previous: number | undefined;
    for (let x = first; (x + 0.5) * cell < straightEdge + 0.1; x++) {
        const t = total(x)!;
        if (previous !== undefined && previous < lit / 2 && t >= lit / 2) {
            edge = (x - 0.5 + (lit / 2 - previous) / (t - previous)) * cell;
            break;
        }
        previous = t;
    }
    const mean = (from: number, to: number): number => {
        let sum = 0;
        let n = 0;
        for (let x = Math.ceil(from / cell); (x + 0.5) * cell <= to; x++) {
            sum += total(x)!;
            n++;
        }
        return sum / Math.max(1, n);
    };
    const band = mean(refractedEdge + 0.02, straightEdge - 0.02);
    const beyond = mean(straightEdge + 0.02, hx - 0.05);
    const dark = mean(-hx + 0.02, refractedEdge - 0.02);
    log(
        `shadow: borda em x = ${edge.toFixed(3)} m contra a refratada ${refractedEdge.toFixed(3)} (a da linha reta ${straightEdge.toFixed(3)}); faixa entre as bordas ${(band / lit).toFixed(3)} do nível aceso, sombra ${(dark / lit).toFixed(3)}, depois da linha reta ${(beyond / lit).toFixed(3)} (h = ${(100 * h).toFixed(1)} cm)`,
    );
    check(
        Math.abs(edge - refractedEdge) <= 0.015,
        `shadow: borda a ${(100 * (edge - refractedEdge)).toFixed(1)} cm da refratada`,
    );
    check(
        Math.abs(band / lit - 1) <= 0.05,
        `shadow: faixa entre as bordas a ${(band / lit).toFixed(3)} do nível aceso`,
    );
    check(dark / lit <= 0.05, `shadow: sombra a ${(dark / lit).toFixed(3)} do nível aceso`);
}

const CASES: Record<string, () => Promise<void>> = {
    reference: caseReference,
    engine: caseEngine,
    water: caseWater,
    shadow: caseShadow,
};

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
