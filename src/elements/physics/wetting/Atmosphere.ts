import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { World } from '../../../scene/world/World';

/** Opções do ar da cena (`Atmosphere`). */
export interface AtmosphereOptions {
    /** Temperatura do ar (°C) (default 20). */
    readonly temperature?: number;
    /** Umidade relativa, em [0, 1] (default 0,5). */
    readonly relativeHumidity?: number;
    /** Velocidade do ar junto às superfícies (m/s) (default 0, ar parado). */
    readonly windSpeed?: number;
}

/** Dado de um `Atmosphere` (layout de `Atmosphere.schema`). */
export interface AtmosphereData {
    temperature: number;
    relativeHumidity: number;
    windSpeed: number;
    _pad0: number;
}

/**
 * Atmosphere — o ar da cena (Camada 3, spec 034): temperatura, umidade relativa e vento. Recurso único, lido por quem
 * troca água com o ar — a evaporação da película nos sólidos (`FluidFieldFlow`, com a temperatura de cada
 * `SurfacePhysics`). Sem ele, o padrão (`Atmosphere.of(world)`): 20 °C, 50 % e ar parado.
 */
export class Atmosphere extends Entity<AtmosphereData> implements Resource {
    static readonly schema = new StructSchema('Atmosphere', {
        temperature: FieldType.f32,
        relativeHumidity: FieldType.f32,
        windSpeed: FieldType.f32,
        _pad0: FieldType.f32,
    });

    /** O ar sem `Atmosphere` na cena. */
    static readonly defaults = new Atmosphere();

    /** O ar do World, ou o padrão. */
    static of(world: World): Atmosphere {
        return world.findResource(Atmosphere.schema, Atmosphere) ?? Atmosphere.defaults;
    }

    state: ResourceState = ResourceState.Uninitialized;

    constructor(options: AtmosphereOptions = {}) {
        super();
        const temperature = options.temperature ?? 20;
        const humidity = options.relativeHumidity ?? 0.5;
        const wind = options.windSpeed ?? 0;
        if (!(temperature > -273.15) || !Number.isFinite(temperature)) {
            throw new RangeError(
                `Atmosphere: temperature acima do zero absoluto (recebeu ${temperature})`,
            );
        }
        if (!(humidity >= 0 && humidity <= 1)) {
            throw new RangeError(`Atmosphere: relativeHumidity em [0, 1] (recebeu ${humidity})`);
        }
        if (!(wind >= 0) || !Number.isFinite(wind)) {
            throw new RangeError(`Atmosphere: windSpeed ≥ 0 (recebeu ${wind})`);
        }
        this.data = { temperature, relativeHumidity: humidity, windSpeed: wind, _pad0: 0 };
    }

    /** Temperatura do ar (°C). */
    get temperature(): number {
        return this.data.temperature;
    }

    /** Umidade relativa, em [0, 1]. */
    get relativeHumidity(): number {
        return this.data.relativeHumidity;
    }

    /** Velocidade do ar (m/s). */
    get windSpeed(): number {
        return this.data.windSpeed;
    }

    /** Sem dado de GPU: quem troca água com o ar leva as taxas derivadas aos seus parâmetros. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
