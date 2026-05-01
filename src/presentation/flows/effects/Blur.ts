import { PostProcessEffect } from '../../resources/PostProcessEffect';

export class Blur extends PostProcessEffect {
    get name(): string {
        return 'Blur';
    }
    get fragmentEntry(): string {
        return 'fs_blur';
    }
}
