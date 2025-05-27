export * from './shape';

// Polyfill for Array.at because QML doesn't seem to support it.
if (!Array.prototype.at) {
    Array.prototype.at = function(index) {
        // Convert the index to an integer
        let n = Math.trunc(index) || 0;

        // Allow negative indexing from the end of the array
        if (n < 0) n += this.length;

        // Return undefined if the index is out of bounds
        if (n < 0 || n >= this.length) return undefined;

        // Return the element at the specified index
        return this[n];
    };
}