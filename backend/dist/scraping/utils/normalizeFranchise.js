"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFranchise = normalizeFranchise;
function normalizeFranchise(t) {
    const map = {
        BRK: "BKN",
        NJN: "BKN",
        SEA: "OKC",
        NOH: "NOP",
        NOK: "NOP",
        CHA: "CHA",
        CHH: "CHA",
        PHW: "GSW",
        SFW: "GSW",
    };
    return map[t] ?? t;
}
//# sourceMappingURL=normalizeFranchise.js.map