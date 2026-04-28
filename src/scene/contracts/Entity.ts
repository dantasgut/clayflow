export abstract class Entity {
    private parts: Entity[] = [];

    add(e: Entity): this {
        this.parts.push(e);
        return this;
    }

    get attached(): readonly Entity[] {
        return this.parts;
    }
}
