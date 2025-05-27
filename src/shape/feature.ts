import type { Cubic } from "./cubic";
import type { PointTransformer } from "./point";

export abstract class Feature {
    constructor(public readonly cubics: Cubic[]) { }

    public buildIgnorableFeature(cubics: Cubic[]) {
        return new Edge(cubics);
    }

    public buildEdge(cubic: Cubic) {
        return new Edge([cubic]);
    }

    public buildConvexCorner(cubics: Cubic[]) {
        return new Corner(cubics, true)
    }

    public buildConcaveCorner(cubics: Cubic[]) {
        return new Corner(cubics, false);
    }

    public abstract transformed(f: PointTransformer): Feature;

    public abstract reversed(): Feature;

    abstract isIgnorableFeature: boolean

    /** Whether this Feature is an Edge with no inward or outward indentation. */
    abstract isEdge: boolean

    /** Whether this Feature is a convex corner (outward indentation in a shape). */
    abstract isConvexCorner: boolean

    /** Whether this Feature is a concave corner (inward indentation in a shape). */
    abstract isConcaveCorner: boolean
}

export class Edge extends Feature {
    transformed(f: PointTransformer): Feature {
        return new Edge(this.cubics.map(c => c.transformed(f)));
    }

    reversed(): Feature {
        return new Edge(this.cubics.map(c => c.reverse()));
    }

    override isIgnorableFeature = true

    override isEdge = true

    override isConvexCorner = false

    override isConcaveCorner = false
}

export class Corner extends Feature {
    override isConvexCorner = false;

    override isConcaveCorner = false;

    constructor(cubics: Cubic[], public readonly convex: boolean) {
        super(cubics);
        this.isConvexCorner = convex;
        this.isConcaveCorner = !this.convex;
    }

    transformed(f: PointTransformer): Feature {
        return new Corner(this.cubics.map(c => c.transformed(f)), this.convex);
    }

    reversed(): Feature {
        return new Corner(this.cubics.map(c => c.reverse()), !this.convex);
    }

    override isIgnorableFeature = false

    override isEdge = false
}