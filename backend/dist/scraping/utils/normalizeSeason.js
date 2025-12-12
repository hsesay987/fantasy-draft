"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSeason = normalizeSeason;
// utils/normalizeSeason.ts
function normalizeSeason(endYear) {
    if (!Number.isFinite(endYear))
        return endYear;
    return endYear - 1;
}
//# sourceMappingURL=normalizeSeason.js.map