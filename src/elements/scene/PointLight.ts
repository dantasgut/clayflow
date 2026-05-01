import { Light } from './Light';

export class PointLight extends Light {
    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = Light.schema.applyDefaults({
            kind: 1,
            castShadow: values.castShadow === true ? 1 : 0,
            intensity: values.intensity ?? 1.0,
            range: values.range ?? 10.0,
            position: values.position ?? [0, 0, 0, 1],
            direction: values.direction ?? [0, 0, 0, 0],
            color: values.color ?? [1, 1, 1, 1],
        });
    }
}
