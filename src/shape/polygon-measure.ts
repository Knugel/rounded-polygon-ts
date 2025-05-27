import type { Cubic } from "./cubic";
import { Point } from "./point";
import { ProgressableFeature } from "./feature-mapping";
import { coerceIn, DistanceEpsilon, positiveModulo } from "./utils";
import type { RoundedPolygon } from "./rounded-polygon";
import { Corner, type Feature } from "./feature";

export class MeasuredPolygon {
    public readonly cubics: MeasuredCubic[] = [];

    constructor(public readonly measurer: Measurer, public readonly features: ProgressableFeature[], cubics: Cubic[], public readonly outlineProgress: number[]) {
        const measuredCubics: MeasuredCubic[] = [];
        let startOutlineProgress = 0;
        for(let i = 0; i < cubics.length; i++) {
            if ((outlineProgress[i + 1] - outlineProgress[i]) > DistanceEpsilon) {
                measuredCubics.push(
                    new MeasuredCubic(this, cubics[i], startOutlineProgress, outlineProgress[i + 1])
                )
                // The next measured cubic will start exactly where this one ends.
                startOutlineProgress = outlineProgress[i + 1]
            }
        }

        measuredCubics[measuredCubics.length - 1].updateProgressRange(measuredCubics[measuredCubics.length - 1].startOutlineProgress, 1);
        this.cubics = measuredCubics;
    }

    public cutAndShift(cuttingPoint: number): MeasuredPolygon {
        if (cuttingPoint < DistanceEpsilon) return this

        // Find the index of cubic we want to cut
        const targetIndex = this.cubics.findIndex(it => cuttingPoint >= it.startOutlineProgress && cuttingPoint <= it.endOutlineProgress);
        const target = this.cubics[targetIndex]
        // Cut the target cubic.
        // b1, b2 are two resulting cubics after cut
        const { a: b1, b: b2 } = target.cutAtProgress(cuttingPoint)

        // Construct the list of the cubics we need:
        // * The second part of the target cubic (after the cut)
        // * All cubics after the target, until the end + All cubics from the start, before the
        //   target cubic
        // * The first part of the target cubic (before the cut)
        const retCubics = [b2.cubic]
        for(let i = 1; i < this.cubics.length; i++) {
            retCubics.push(this.cubics[(i + targetIndex) % this.cubics.length].cubic)
        }
        retCubics.push(b1.cubic)

        // Construct the array of outline progress.
        // For example, if we have 3 cubics with outline progress [0 .. 0.3], [0.3 .. 0.8] &
        // [0.8 .. 1.0], and we cut + shift at 0.6:
        // 0.  0123456789
        //     |--|--/-|-|
        // The outline progresses will start at 0 (the cutting point, that shifs to 0.0),
        // then 0.8 - 0.6 = 0.2, then 1 - 0.6 = 0.4, then 0.3 - 0.6 + 1 = 0.7,
        // then 1 (the cutting point again),
        // all together: (0.0, 0.2, 0.4, 0.7, 1.0)
        const retOutlineProgress = [];
        for (let i = 0; i < this.cubics.length + 2; i++) {
            if (i === 0) {
                retOutlineProgress.push(0)
            } else if(i === this.cubics.length + 1) {
                retOutlineProgress.push(1);
            } else {
                const cubicIndex = (targetIndex + i - 1) % this.cubics.length
                retOutlineProgress.push(positiveModulo(this.cubics[cubicIndex].endOutlineProgress - cuttingPoint, 1));
            }
        }

        // Shift the feature's outline progress too.
        const newFeatures: ProgressableFeature[] = [];
        for(let i = 0; i < this.features.length; i++) {
            newFeatures.push(new ProgressableFeature(positiveModulo(this.features[i].progress - cuttingPoint, 1), this.features[i].feature))
        }

        // Filter out all empty cubics (i.e. start and end anchor are (almost) the same point.)
        return new MeasuredPolygon(this.measurer, newFeatures, retCubics, retOutlineProgress)
    }

    public static measurePolygon(measurer: Measurer, polygon: RoundedPolygon): MeasuredPolygon {
        const cubics: Cubic[] = [];
        const featureToCubic: { a: Feature, b: number }[] = []

        for (let featureIndex = 0; featureIndex < polygon.features.length; featureIndex++) {
            const feature = polygon.features[featureIndex]
            for (let cubicIndex = 0; cubicIndex < feature.cubics.length; cubicIndex++) {
                if (feature instanceof Corner && cubicIndex == feature.cubics.length / 2) {
                    featureToCubic.push({ a: feature, b: cubics.length });
                }
                cubics.push(feature.cubics[cubicIndex])
            }
        }

        const measures: number[] = [0]; // Initialize with 0 like in Kotlin's scan
        for (const cubic of cubics) {
            const measurement = measurer.measureCubic(cubic);
            if (measurement < 0) {
                throw new Error("Measured cubic is expected to be greater or equal to zero");
            }
            const lastMeasure = measures[measures.length - 1];
            measures.push(lastMeasure + measurement);
        }
        const totalMeasure = measures[measures.length - 1];

        const outlineProgress = [];
        for (let i = 0; i < measures.length; i++) {
            outlineProgress.push(measures[i] / totalMeasure)
        }

        const features = [];
        for (let i = 0; i < featureToCubic.length; i++) {
            const ix = featureToCubic[i].b
            features.push(
                new ProgressableFeature(positiveModulo((outlineProgress[ix] + outlineProgress[ix + 1]) / 2, 1), featureToCubic[i].a));
        }

        return new MeasuredPolygon(measurer, features, cubics, outlineProgress);
    }
}

class MeasuredCubic {
    public measuredSize: number;

    constructor(public readonly polygon: MeasuredPolygon, public readonly cubic: Cubic, public startOutlineProgress: number, public endOutlineProgress: number) {
        this.measuredSize = this.polygon.measurer.measureCubic(cubic);
    }

    public updateProgressRange(
        startOutlineProgress = this.startOutlineProgress,
        endOutlineProgress = this.endOutlineProgress,
    ) {
        this.startOutlineProgress = startOutlineProgress
        this.endOutlineProgress = endOutlineProgress
    }

    public cutAtProgress(cutOutlineProgress: number): { a: MeasuredCubic, b: MeasuredCubic } {
        const boundedCutOutlineProgress = coerceIn(cutOutlineProgress, this.startOutlineProgress, this.endOutlineProgress);
        const outlineProgressSize = this.endOutlineProgress - this.startOutlineProgress
        const progressFromStart = boundedCutOutlineProgress - this.startOutlineProgress

        const relativeProgress = progressFromStart / outlineProgressSize
        const t = this.polygon.measurer.findCubicCutPoint(this.cubic, relativeProgress * this.measuredSize);

        const {a: c1, b: c2} = this.cubic.split(t);
        return { a: new MeasuredCubic(this.polygon, c1, this.startOutlineProgress, boundedCutOutlineProgress), b: new MeasuredCubic(this.polygon, c2, boundedCutOutlineProgress, this.endOutlineProgress) }
    }
}

export interface Measurer {
    /**
     * Returns size of given cubic, according to however the implementation wants to measure the
     * size (angle, length, etc). It has to be greater or equal to 0.
     */
    measureCubic(c: Cubic): number

    /**
     * Given a cubic and a measure that should be between 0 and the value returned by measureCubic
     * (If not, it will be capped), finds the parameter t of the cubic at which that measure is
     * reached.
     */
    findCubicCutPoint(c: Cubic, m: number): number
}

export class LengthMeasurer implements Measurer {
    private segments = 3;

    measureCubic(c: Cubic): number {
        return this.closestProgressTo(c, Number.POSITIVE_INFINITY).y
    }

    findCubicCutPoint(c: Cubic, m: number): number {
        return this.closestProgressTo(c, m).x
    }

    private closestProgressTo(cubic: Cubic, threshold: number): Point {
        let total = 0
        let remainder = threshold
        let prev = new Point(cubic.anchor0X, cubic.anchor0Y)

        for (let i = 1; i < this.segments; i++) {
            const progress = i / this.segments
            const point = cubic.pointOnCurve(progress)
            const segment = point.minus(prev).getDistance();

            if (segment >= remainder) {
                return new Point(progress - (1.0 - remainder / segment) / this.segments, threshold)
            }

            remainder -= segment
            total += segment
            prev = point
        }

        return new Point(1.0, total);
    }
}