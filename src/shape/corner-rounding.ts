export class CornerRounding {
    constructor(public readonly radius: number = 0, public readonly smoothing: number = 0) {
    }

    public static Unrounded = new CornerRounding();
}