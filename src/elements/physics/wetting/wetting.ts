// A física da água que molha um sólido (spec 034): a película fina sobre ele, presa pela linha de contato, absorvida
// pelos poros e evaporada pelo ar. Fórmulas puras (SI), que o estágio da película leva à GPU por superfície
// (`FluidFieldFlow`) e que os testes conferem contra os valores de referência.

/** Densidade da água líquida (kg/m³). */
export const WATER_DENSITY = 1000;

/**
 * Pressão de vapor de saturação da água (kPa) à temperatura `t` (°C): a fórmula de Magnus com os coeficientes de
 * Alduchov e Eskridge (1996), erro abaixo de 0,4 % entre −40 e 50 °C.
 */
export function saturationVaporPressure(t: number): number {
    return 0.61094 * Math.exp((17.625 * t) / (t + 243.04));
}

/** Calor latente de vaporização da água (kJ/kg) à temperatura `t` (°C), linear entre 0 e 100 °C. */
export function latentHeat(t: number): number {
    return 2500.8 - 2.36 * t;
}

/** O ar e a superfície na evaporação. */
export interface EvaporationConditions {
    /** Temperatura do ar (°C). */
    readonly airTemperature: number;
    /** Temperatura da superfície molhada (°C). */
    readonly surfaceTemperature: number;
    /** Umidade relativa do ar, em [0, 1]. */
    readonly relativeHumidity: number;
    /** Velocidade do ar sobre a superfície (m/s). */
    readonly windSpeed: number;
}

/**
 * Taxa de evaporação da água livre (m/s de espessura) — a equação de Carrier (1918; ASHRAE Handbook, HVAC
 * Applications, cap. "Places of Assembly", piscinas): W = (0,089 + 0,0782 V)(p_w − p_a) / Y kg/(m²·s), com p_w a pressão
 * de saturação na temperatura da superfície, p_a a pressão parcial do vapor no ar (umidade × saturação na do ar), em
 * kPa, Y o calor latente em kJ/kg e V o vento em m/s. Ar mais úmido que a superfície (orvalho) não evapora: 0.
 */
export function evaporationRate(c: EvaporationConditions): number {
    const pw = saturationVaporPressure(c.surfaceTemperature);
    const pa = c.relativeHumidity * saturationVaporPressure(c.airTemperature);
    const w =
        ((0.089 + 0.0782 * Math.max(c.windSpeed, 0)) * (pw - pa))
        / latentHeat(c.surfaceTemperature);
    return Math.max(w, 0) / WATER_DENSITY;
}

/** Ângulo aparente numa superfície rugosa (Wenzel 1936): cos θ* = r cos θ, grampeado em [−1, 1] (molha toda, ou nada). */
export function wenzelCos(theta: number, roughness: number): number {
    return Math.min(1, Math.max(-1, roughness * Math.cos((theta * Math.PI) / 180)));
}

/** O par líquido–sólido na linha de contato. */
export interface ContactLine {
    /** Tensão superficial do líquido (N/m). */
    readonly surfaceTension: number;
    /** Ângulo de contato de Young do par, no sólido liso (graus). */
    readonly contactAngle: number;
    /** Histerese do ângulo no sólido liso, θ_avanço − θ_recuo (graus). */
    readonly hysteresis: number;
    /** Razão de Wenzel: área real sobre a aparente (≥ 1). */
    readonly roughness: number;
}

/**
 * Força que segura a linha de contato por comprimento (N/m), a de Furmidge (1962): γ (cos θ_r − cos θ_a), com os
 * ângulos de avanço e de recuo (o de Young ± metade da histerese) levados ao aparente pela rugosidade (Wenzel) — a
 * rugosidade multiplica a diferença dos cossenos, e a gota precisa de mais peso para romper a borda.
 */
export function contactLineRetention(c: ContactLine): number {
    const advancing = Math.min(180, c.contactAngle + c.hysteresis / 2);
    const receding = Math.max(0, c.contactAngle - c.hysteresis / 2);
    return (
        c.surfaceTension
        * Math.max(0, wenzelCos(receding, c.roughness) - wenzelCos(advancing, c.roughness))
    );
}

/**
 * Espessura (m) que a película segura parada numa célula de lado `cell` (m) com a gravidade `gt` (m/s²) ao longo do
 * sólido: o peso da água na célula, ρ g_t h ℓ², contra a borda ancorada, f ℓ (`retention`, N/m) — acima dela, o
 * excesso rompe a borda e escorre.
 */
export function pinnedThickness(
    retention: number,
    gt: number,
    cell: number,
    density = WATER_DENSITY,
): number {
    return gt > 0 ? retention / (density * gt * cell) : Infinity;
}

/**
 * Velocidade média (m/s) de uma película fina de espessura `h` (m) escorrendo pela gravidade `gt` (m/s²) ao longo do
 * sólido (Nusselt 1916: g_t h² / (3ν), ν a viscosidade cinemática em m²/s), freada pela rugosidade: o atrito com a
 * parede age sobre a área real, `roughness` vezes a aparente.
 */
export function filmVelocity(
    h: number,
    gt: number,
    kinematicViscosity: number,
    roughness = 1,
): number {
    return (gt * h * h) / (3 * kinematicViscosity * roughness);
}

/** O meio poroso que absorve a água. */
export interface PorousMedium {
    /** Fração de vazios, em [0, 1). */
    readonly porosity: number;
    /** Raio efetivo dos capilares (m), com a tortuosidade já embutida (o que reproduz a sortividade medida). */
    readonly poreRadius: number;
    /** Espessura da camada que absorve (m). */
    readonly thickness: number;
}

/**
 * Coeficiente da absorção capilar (m²/s), de Lucas–Washburn: a frente entra a L = √(γ r cos θ t / (2μ)) e a água
 * absorvida por área é A = φ L, logo A² = φ² γ r cos θ t / (2μ) — este coeficiente. É o quadrado da sortividade S
 * (A = S √t) que se mede nos materiais de construção (ASTM C1585). Sem absorção se o líquido não molha (θ ≥ 90°).
 */
export function washburnCoefficient(
    medium: PorousMedium,
    surfaceTension: number,
    contactAngle: number,
    viscosity: number,
): number {
    const cos = Math.cos((contactAngle * Math.PI) / 180);
    if (!(cos > 0) || !(viscosity > 0)) return 0;
    return (medium.porosity ** 2 * surfaceTension * medium.poreRadius * cos) / (2 * viscosity);
}

/** Água que o meio poroso guarda saturado (m de espessura por área): φ vezes a espessura da camada. */
export function porousCapacity(medium: PorousMedium): number {
    return medium.porosity * medium.thickness;
}

/** Água absorvida (m por área) depois de `t` s de contato com água livre, a partir de seca: √(W t), até a capacidade. */
export function absorbedAfter(washburn: number, capacity: number, t: number): number {
    return Math.min(capacity, Math.sqrt(washburn * t));
}

/**
 * Evaporação da água absorvida (m/s), no período de taxa decrescente da secagem: sem água livre por cima, o vapor sai
 * pelos poros e a taxa cai com a saturação `s` (água absorvida sobre a capacidade) — a aproximação de primeira ordem
 * do período decrescente: a taxa da água livre vezes s.
 */
export function absorbedEvaporationRate(rate: number, saturation: number): number {
    return rate * Math.min(1, Math.max(0, saturation));
}

/** O líquido que molha (a água das partículas). */
export interface WettingLiquid {
    /** Tensão superficial (N/m). */
    readonly surfaceTension: number;
    /** Ângulo de contato de Young com os sólidos (graus), quando o sólido não dá o seu. */
    readonly contactAngle: number;
    /** Viscosidade dinâmica (Pa·s). */
    readonly viscosity: number;
    /** Densidade (kg/m³). */
    readonly density: number;
}

/** O que a película precisa de uma superfície, já com o líquido e o ar. */
export interface FilmSurfaceTerms {
    /** A força da borda por comprimento sobre a densidade, f / ρ (m³/s²): a espessura presa é isto / (g_t ℓ). */
    readonly retentionPerDensity: number;
    /** O inverso da rugosidade: o fator do atrito no escoamento. */
    readonly mobility: number;
    /** O coeficiente de Washburn (m²/s). */
    readonly washburn: number;
    /** A água que os poros guardam saturados (m). */
    readonly capacity: number;
    /** A taxa de evaporação da água livre (m/s). */
    readonly evaporation: number;
}

/** As grandezas da película numa superfície: a física dela, o líquido e o ar. */
export function filmSurfaceTerms(
    surface: {
        readonly roughness: number;
        readonly hysteresis: number;
        readonly contactAngle?: number | undefined;
        readonly temperature?: number | undefined;
    } & PorousMedium,
    liquid: WettingLiquid,
    air: {
        readonly temperature: number;
        readonly relativeHumidity: number;
        readonly windSpeed: number;
    },
): FilmSurfaceTerms {
    const contactAngle = surface.contactAngle ?? liquid.contactAngle;
    return {
        retentionPerDensity:
            contactLineRetention({
                surfaceTension: liquid.surfaceTension,
                contactAngle,
                hysteresis: surface.hysteresis,
                roughness: surface.roughness,
            }) / liquid.density,
        mobility: 1 / surface.roughness,
        washburn: washburnCoefficient(
            surface,
            liquid.surfaceTension,
            contactAngle,
            liquid.viscosity,
        ),
        capacity: porousCapacity(surface),
        evaporation: evaporationRate({
            airTemperature: air.temperature,
            surfaceTemperature: surface.temperature ?? air.temperature,
            relativeHumidity: air.relativeHumidity,
            windSpeed: air.windSpeed,
        }),
    };
}
