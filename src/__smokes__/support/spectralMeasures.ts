// Medidas de imagem da 033 (spec 033, T005): a escala das partículas na silhueta e na superfície da água (US7), a
// continuidade do realce, os degraus entre vizinhos (névoa, US8) e a média HDR por região (luz rebatida contra a
// referência, US1). Puras (sem o motor): testadas na CPU.

/** Região retangular de uma imagem (pixels). */
export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

/** Imagem HDR lida: RGBA linear por pixel. */
export interface HdrImage {
    readonly width: number;
    readonly height: number;
    readonly data: Float32Array;
}

/** Luminância 8 bits (0–1) de um pixel. */
function lum8(img: ImageData, x: number, y: number): number {
    const i = (y * img.width + x) * 4;
    return (0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!) / 255;
}

/** Energia por período da DFT de um sinal 1D sem a média e sem a reta de mínimos quadrados. */
function spectrum(signal: readonly number[]): { period: number; energy: number }[] {
    const n = signal.length;
    const mx = (n - 1) / 2;
    const my = signal.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
        sxy += (i - mx) * (signal[i]! - my);
        sxx += (i - mx) * (i - mx);
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const r = signal.map((v, i) => v - my - slope * (i - mx));
    const out: { period: number; energy: number }[] = [];
    for (let k = 1; k <= n / 2; k++) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < n; i++) {
            const a = (-2 * Math.PI * k * i) / n;
            re += r[i]! * Math.cos(a);
            im += r[i]! * Math.sin(a);
        }
        out.push({ period: n / k, energy: re * re + im * im });
    }
    return out;
}

/**
 * Fração da energia (sem a média e a tendência linear) de um sinal 1D nos períodos em [`periodMin`, `periodMax`]
 * amostras, pela DFT direta. Uma ondulação na escala das partículas concentra energia nessa faixa; um sinal sem
 * ondulação (resíduo abaixo de 1e-9 por amostra) dá 0.
 */
export function bandEnergy(
    signal: readonly number[],
    periodMin: number,
    periodMax: number,
): number {
    if (signal.length < 4) return 0;
    const sp = spectrum(signal);
    const total = sp.reduce((a, e) => a + e.energy, 0);
    if (total <= 1e-18 * signal.length * signal.length) return 0;
    const band = sp
        .filter((e) => e.period >= periodMin && e.period <= periodMax)
        .reduce((a, e) => a + e.energy, 0);
    return band / total;
}

/**
 * Amplitude RMS de um sinal 1D nos períodos em [`periodMin`, `periodMax`] amostras (nas unidades do sinal): a parte
 * do sinal que oscila na escala dada (Parseval).
 */
export function bandAmplitude(
    signal: readonly number[],
    periodMin: number,
    periodMax: number,
): number {
    const n = signal.length;
    if (n < 4) return 0;
    const band = spectrum(signal)
        .filter((e) => e.period >= periodMin && e.period <= periodMax)
        .reduce((a, e) => a + e.energy, 0);
    return Math.sqrt((2 * band) / (n * n));
}

/**
 * Silhueta horizontal numa região: por coluna, a posição subpixel (linha) onde a luminância cruza `threshold`
 * procurando de cima para baixo; colunas sem cruzamento ficam de fora.
 */
export function silhouetteRows(
    img: ImageData,
    rect: Rect,
    threshold: number,
    above: 'dark' | 'bright' = 'dark',
): number[] {
    const rows: number[] = [];
    for (let x = rect.x; x < rect.x + rect.w; x++) {
        let prev = lum8(img, x, rect.y);
        for (let y = rect.y + 1; y < rect.y + rect.h; y++) {
            const cur = lum8(img, x, y);
            const crossed =
                above === 'dark'
                    ? prev < threshold && cur >= threshold
                    : prev > threshold && cur <= threshold;
            if (crossed) {
                rows.push(y - 1 + (threshold - prev) / (cur - prev));
                break;
            }
            prev = cur;
        }
    }
    return rows;
}

/** Ondulação de uma silhueta: o desvio RMS (pixels) sem a reta e a fração de energia na faixa de períodos dada. */
export function contourRipple(
    rows: readonly number[],
    periodMin: number,
    periodMax: number,
): { rms: number; band: number } {
    const n = rows.length;
    if (n < 4) return { rms: 0, band: 0 };
    const mx = (n - 1) / 2;
    const my = rows.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
        sxy += (i - mx) * (rows[i]! - my);
        sxx += (i - mx) * (i - mx);
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) s2 += (rows[i]! - my - slope * (i - mx)) ** 2;
    return { rms: Math.sqrt(s2 / n), band: bandEnergy(rows, periodMin, periodMax) };
}

/**
 * Padrão periódico numa região (favo de mel): a média, sobre linhas e colunas, da amplitude RMS da luminância (0–1)
 * nos períodos em [`periodMin`, `periodMax`] pixels.
 */
export function regionBandAmplitude(
    img: ImageData,
    rect: Rect,
    periodMin: number,
    periodMax: number,
): number {
    let total = 0;
    let n = 0;
    for (let y = rect.y; y < rect.y + rect.h; y += 2) {
        const row: number[] = [];
        for (let x = rect.x; x < rect.x + rect.w; x++) row.push(lum8(img, x, y));
        total += bandAmplitude(row, periodMin, periodMax);
        n++;
    }
    for (let x = rect.x; x < rect.x + rect.w; x += 2) {
        const col: number[] = [];
        for (let y = rect.y; y < rect.y + rect.h; y++) col.push(lum8(img, x, y));
        total += bandAmplitude(col, periodMin, periodMax);
        n++;
    }
    return n === 0 ? 0 : total / n;
}

/**
 * Continuidade de um realce: dos pixels acima de `threshold`, a fração isolada (sem vizinho acima do limiar na
 * vizinhança 8). Um realce contínuo tem fração ~0; pontos de brilho soltos, perto de 1.
 */
export function isolatedHighlights(img: ImageData, rect: Rect, threshold: number): number {
    let bright = 0;
    let isolated = 0;
    for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) {
        for (let x = rect.x + 1; x < rect.x + rect.w - 1; x++) {
            if (lum8(img, x, y) < threshold) continue;
            bright++;
            let neighbor = false;
            for (let dy = -1; dy <= 1 && !neighbor; dy++)
                for (let dx = -1; dx <= 1 && !neighbor; dx++)
                    if ((dx !== 0 || dy !== 0) && lum8(img, x + dx, y + dy) >= threshold)
                        neighbor = true;
            if (!neighbor) isolated++;
        }
    }
    return bright === 0 ? 0 : isolated / bright;
}

/**
 * Degraus entre vizinhos numa região lisa: a fração de pares horizontais/verticais de pixels cuja diferença de
 * luminância (0–1) passa de `step` — com o gradiente suave da névoa, ~0; faixas e blocos aparecem como degraus.
 */
export function neighborSteps(img: ImageData, rect: Rect, step: number): number {
    let pairs = 0;
    let steps = 0;
    for (let y = rect.y; y < rect.y + rect.h - 1; y++) {
        for (let x = rect.x; x < rect.x + rect.w - 1; x++) {
            const l = lum8(img, x, y);
            for (const [dx, dy] of [
                [1, 0],
                [0, 1],
            ] as const) {
                pairs++;
                if (Math.abs(lum8(img, x + dx, y + dy) - l) > step) steps++;
            }
        }
    }
    return pairs === 0 ? 0 : steps / pairs;
}

/** Média RGB linear de uma imagem HDR nos pixels da máscara. */
export function hdrRegionMean(
    img: HdrImage,
    inside: (x: number, y: number) => boolean,
): [number, number, number] {
    const s = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            if (!inside(x, y)) continue;
            const i = (y * img.width + x) * 4;
            const c = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!] as const;
            s[0]! += c[0];
            s[1]! += c[1];
            s[2]! += c[2];
            n++;
        }
    }
    return n === 0 ? [0, 0, 0] : [s[0]! / n, s[1]! / n, s[2]! / n];
}
