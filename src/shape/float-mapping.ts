import { positiveModulo } from "./utils";

export class DoubleMapper {
    private sourceValues: number[] = [];
    private targetValues: number[] = []

    constructor(...mappings: { a: number, b: number }[]) {
        for(const mapping of mappings) {
            this.sourceValues.push(mapping.a);
            this.targetValues.push(mapping.b);
        }
    }

    public map(x: number) {
        return linearMap(this.sourceValues, this.targetValues, x);
    }

    public mapBack(x: number) {
        return linearMap(this.targetValues, this.sourceValues, x);
    }

    public static Identity = new DoubleMapper({ a: 0, b: 0 }, { a: 0.5, b: 0.5 });
}

function linearMap(xValues: number[], yValues: number[], x: number) {

    let segmentStartIndex = -1;
    for (let i = 0; i < xValues.length; i++) {
        const nextIndex = (i + 1) % xValues.length;
        if (progressInRange(x, xValues[i], xValues[nextIndex])) {
            segmentStartIndex = i;
            break;
        }
    }

    if (segmentStartIndex === -1) {
        throw new Error("No valid segment found");
    }

    const segmentEndIndex = (segmentStartIndex + 1) % xValues.length;
    const segmentSizeX = positiveModulo(xValues[segmentEndIndex] - xValues[segmentStartIndex], 1);
    const segmentSizeY = positiveModulo(yValues[segmentEndIndex] - yValues[segmentStartIndex], 1);

    let positionInSegment: number;
    if (segmentSizeX < 0.001) {
        positionInSegment = 0.5;
    } else {
        positionInSegment = positiveModulo(x - xValues[segmentStartIndex], 1) / segmentSizeX;
    }

    return positiveModulo(yValues[segmentStartIndex] + segmentSizeY * positionInSegment, 1);
}

export function progressInRange(progress: number, progressFrom: number, progressTo: number) {
    if (progressTo >= progressFrom) {
        return progress >= progressFrom && progress <= progressTo;
    } else {
        return progress >= progressFrom || progress <= progressTo
    }
}