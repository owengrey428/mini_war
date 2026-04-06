// ===== SEEDED PRNG (Mulberry32) =====
class SeededRandom {
    constructor(seed) {
        this.state = seed | 0;
        if (this.state === 0) this.state = 1;
    }

    next() {
        this.state |= 0;
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Returns integer in [0, max)
    nextInt(max) {
        return Math.floor(this.next() * max);
    }

    // Returns float in [min, max)
    nextRange(min, max) {
        return min + this.next() * (max - min);
    }

    // Pick random element from array
    pick(arr) {
        return arr[this.nextInt(arr.length)];
    }
}

module.exports = SeededRandom;
