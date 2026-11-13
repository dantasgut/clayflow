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
 * Ancoramento de uma gota pousada num sólido (spec 034, T066d; Furmidge 1962): a borda segura a gota com a força f w — a
 * retenção da linha de contato por comprimento (`contactLineRetention`, N/m) vezes a largura da base dela —, e a gota
 * escorre quando o peso ao longo do sólido passa disso. A gota de volume `volume` (m³) e massa `mass` (kg) é a calota
 * esférica do ângulo de contato θ dela com o sólido: raio r = ∛(3V / (π (2 − 3 cos θ + cos³ θ))), base 2 r sen θ.
 * Devolve a aceleração (m/s²) que a borda segura ao longo do sólido — o ângulo de deslize é asen(a / g); 0 com θ ≥ 90°
 * (não molha) ou sem retenção.
 */
export function dropPinning(line: ContactLine, volume: number, mass: number): number {
    const theta = (Math.min(Math.max(line.contactAngle, 0), 180) * Math.PI) / 180;
    if (!(line.contactAngle < 90) || !(volume > 0) || !(mass > 0)) return 0;
    const c = Math.cos(theta);
    const shape = 2 - 3 * c + c * c * c;
    if (!(shape > 0)) return 0;
    const r = Math.cbrt((3 * volume) / (Math.PI * shape));
    const width = 2 * r * Math.sin(theta);
    return (contactLineRetention(line) * width) / mass;
}

/**
 * A gota em que a água da película se junta (spec 034, T066d): a calota esférica de ângulo de contato θ e volume h ℓ² (a
 * água livre h somada num bloco de células de lado `cell` = ℓ) tem a base de raio a = κ ∛h, com
 * κ = ∛(3 ℓ² sen³ θ / (π (2 − 3 cos θ + cos³ θ))) — o volume da calota é π a³ (2 − 3 cos θ + cos³ θ) / (3 sen³ θ). Na
 * molhagem parcial a película fina se rompe em gotas (de Gennes, Brochard-Wyart e Quéré, "Capillarity and Wetting
 * Phenomena", cap. 7): abaixo da espessura crítica (`filmBreakThickness`) a película se rompe, e nos sítios de passo ℓ a
 * água de cada sítio é uma gota de base a = κ ∛(V / ℓ²) (`field_film_sample`). Devolve κ (m^⅔), ou 0 onde a água não se junta em gotas: a molhagem total (θ = 0, a película
 * se espalha) e θ ≥ 90° (a calota passaria do hemisfério e deixaria de ser altura sobre o sólido).
 */
export function dropBaseCoefficient(contactAngle: number, cell: number): number {
    if (!(contactAngle > 0 && contactAngle < 90) || !(cell > 0)) return 0;
    const theta = (contactAngle * Math.PI) / 180;
    const c = Math.cos(theta);
    const sin = Math.sin(theta);
    return Math.cbrt((3 * cell * cell * sin * sin * sin) / (Math.PI * (2 - 3 * c + c * c * c)));
}

/**
 * A espessura crítica (m) abaixo da qual a película de um líquido que molha em parte (0 < θ < 90°) se rompe em gotas: a
 * película de equilíbrio sob a gravidade, e_c = 2 ℓ_c sen(θ/2), com ℓ_c = √(γ / (ρ g)) o comprimento capilar (de Gennes,
 * Brochard-Wyart e Quéré, "Capillarity and Wetting Phenomena", cap. 7: a película mais fina que ela é instável e se
 * desfaz). 0 sem ruptura (θ = 0, a película se espalha; θ ≥ 90°) ou sem gravidade (`g` 0: a capilaridade vale em
 * qualquer escala, e_c sem limite — devolve +∞).
 */
export function filmBreakThickness(
    surfaceTension: number,
    density: number,
    gravity: number,
    contactAngle: number,
): number {
    if (!(contactAngle > 0 && contactAngle < 90) || !(surfaceTension > 0) || !(density > 0))
        return 0;
    if (!(gravity > 0)) return Infinity;
    const lc = Math.sqrt(surfaceTension / (density * gravity));
    return 2 * lc * Math.sin((contactAngle * Math.PI) / 360);
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
    /** O cosseno do ângulo de contato de Young da água no sólido. */
    readonly contactCosine: number;
    /** O coeficiente da base da gota numa célula da película (`dropBaseCoefficient`; 0 sem gotas). */
    readonly dropBase: number;
    /** A espessura abaixo da qual a película se rompe em gotas (`filmBreakThickness`, m; 0 sem ruptura). */
    readonly breakThickness: number;
}

/**
 * As grandezas da película numa superfície: a física dela, o líquido e o ar; `cell` (m) é o lado da célula da película
 * (a base da gota, `dropBaseCoefficient`; 0: sem gotas) e `gravity` (m/s²) a aceleração da gravidade (a espessura em que
 * a película se rompe, `filmBreakThickness`).
 */
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
    cell = 0,
    gravity = 9.81,
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
        contactCosine: Math.cos((Math.min(Math.max(contactAngle, 0), 180) * Math.PI) / 180),
        dropBase: dropBaseCoefficient(contactAngle, cell),
        breakThickness: filmBreakThickness(
            liquid.surfaceTension,
            liquid.density,
            gravity,
            contactAngle,
        ),
    };
}
