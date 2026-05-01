import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class Fxaa extends PostProcessEffect {
    get name(): string {
        return 'Fxaa';
    }
    get fragmentEntry(): string {
        return 'fs_fxaa';
    }
}
