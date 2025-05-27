import type { RoundedPolygon } from "./rounded-polygon";
import { Cubic, MutableCubic } from "./cubic";
import { LengthMeasurer, MeasuredPolygon } from "./polygon-measure";
import { featureMapper } from "./feature-mapping";
import { AngleEpsilon, interpolate, positiveModulo } from "./utils";

export class Morph {
    public morphMatch: { a: Cubic, b: Cubic }[] = [];

    constructor(start: RoundedPolygon, end: RoundedPolygon) {
        this.morphMatch = this.match(start, end);
    }

    public asCubics(progress: number) {
        const ret: Cubic[] = [];

        // The first/last mechanism here ensures that the final anchor point in the shape
        // exactly matches the first anchor point. There can be rendering artifacts introduced
        // by those points being slightly off, even by much less than a pixel
        var firstCubic: Cubic | null = null;
        var lastCubic: Cubic | null = null;
        for (let i = 0; i < this.morphMatch.length; i++) {
            const cubic = new Cubic(Array.from({ length: 8 }).map((_, it) => interpolate(
                    this.morphMatch[i].a.points[it],
                    this.morphMatch[i].b.points[it],
                    progress,
                )));
            if (firstCubic == null)
                firstCubic = cubic
            if (lastCubic != null)
                ret.push(lastCubic);
            lastCubic = cubic
        }
        if (lastCubic != null && firstCubic != null)
            ret.push(
                new Cubic([
                    lastCubic.anchor0X,
                    lastCubic.anchor0Y,
                    lastCubic.control0X,
                    lastCubic.control0Y,
                    lastCubic.control1X,
                    lastCubic.control1Y,
                    firstCubic.anchor0X,
                    firstCubic.anchor0Y,
                ])
            )
        return ret;
    }

    public forEachCubic(progress: number, mutableCubic: MutableCubic, callback: ((value: MutableCubic) => void)) {
        for (let i = 0; i < this.morphMatch.length; i++) {
            mutableCubic.interpolate(this.morphMatch[i].a, this.morphMatch[i].b, progress)
            callback(mutableCubic);
        }
    }

    private match(p1: RoundedPolygon, p2: RoundedPolygon) {
        const measuredPolygon1 = MeasuredPolygon.measurePolygon(new LengthMeasurer(), p1)
        const measuredPolygon2 = MeasuredPolygon.measurePolygon(new LengthMeasurer(), p2)

        const features1 = measuredPolygon1.features
        const features2 = measuredPolygon2.features

        const doubleMapper = featureMapper(features1, features2)

        const polygon2CutPoint = doubleMapper.map(0);

        const bs1 = measuredPolygon1
        const bs2 = measuredPolygon2.cutAndShift(polygon2CutPoint)

        const ret: { a: Cubic, b: Cubic }[] = []

        let i1 = 0
        let i2 = 0

        let b1 = bs1.cubics[i1++]
        let b2 = bs2.cubics[i2++]

        while (b1 != null && b2 != null) {
            const b1a = (i1 == bs1.cubics.length) ? 1 : b1.endOutlineProgress;
            const b2a =  (i2 == bs2.cubics.length) ? 1 : doubleMapper.mapBack(positiveModulo(b2.endOutlineProgress + polygon2CutPoint, 1))
            const minb = Math.min(b1a, b2a)
            const { a: seg1, b: newb1 } = b1a > minb + AngleEpsilon ? b1.cutAtProgress(minb) : { a: b1, b: bs1.cubics[i1++] };
            const { a: seg2, b: newb2 } = b2a > minb + AngleEpsilon ? b2.cutAtProgress(positiveModulo(doubleMapper.map(minb) - polygon2CutPoint, 1)) : { a: b2, b: bs2.cubics[i2++] };

            ret.push({ a: seg1.cubic, b: seg2.cubic })
            b1 = newb1;
            b2 = newb2;
        }

        return ret;
    }
}