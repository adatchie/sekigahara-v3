/**
 * SEKIGAHARA RTS - Formation System
 * 陣形システム: 本陣の移動制限とステータス修正
 */

import { getDistRaw, getLine, hexToPixel } from './pathfinding.js';
import { FORMATION_HOKO, FORMATION_KAKUYOKU, FORMATION_GYORIN } from './constants.js';

/**
 * 陣形情報を取得
 */
export const FORMATION_INFO = {
    [FORMATION_HOKO]: {
        name: '鋒矢の陣',
        nameShort: '鋒矢',
        description: '攻撃+20 / 防御-20\n先陣を切って攻める',
        atkMod: 20,
        defMod: -20,
        requiredSubordinates: 0,
        // Dir 0 (East) Base
        slots: [
            { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }, { q: 5, r: 0 }, // Spine
            { q: 1, r: -1 }, { q: 2, r: -1 }, { q: 3, r: -1 }, // Left Inner
            { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 }, // Right Inner
            { q: 1, r: -2 }, { q: 2, r: -2 }, // Left Outer
            { q: -1, r: 2 }, { q: 0, r: 2 }, // Right Outer
            { q: 1, r: -3 }, { q: -2, r: 3 }, // Tips
            { q: 0, r: -1 }, { q: 0, r: -2 }, // Base Left
            { q: -1, r: 1 }, { q: -1, r: 0 }, { q: -1, r: -1 }, // Back
            { q: -2, r: 1 }, { q: -2, r: 2 }, { q: -2, r: 0 }, // Back Wide
            { q: -3, r: 0 }, { q: -3, r: 1 }, { q: -3, r: 2 }, // Back Far
            { q: -2, r: -1 }, { q: -2, r: -2 } // Back Fill
        ]
    },
    [FORMATION_KAKUYOKU]: {
        name: '鶴翼の陣',
        nameShort: '鶴翼',
        description: '攻撃±0 / 防御±0\nバランス型の陣形',
        atkMod: 0,
        defMod: 0,
        requiredSubordinates: 1,
        // V-shape opening to East
        slots: [
            // Left Wing (NE)
            { q: 0, r: -1 }, { q: 1, r: -2 }, { q: 2, r: -3 }, { q: 3, r: -4 }, { q: 4, r: -5 }, { q: 5, r: -6 },
            // Right Wing (SE)
            { q: 0, r: 1 }, { q: 1, r: 2 }, { q: 2, r: 3 }, { q: 3, r: 4 }, { q: 4, r: 5 }, { q: 5, r: 6 },
            // Inner Left & Right
            { q: 1, r: -3 }, { q: 2, r: -4 }, { q: 3, r: -5 },
            { q: 1, r: 3 }, { q: 2, r: 4 }, { q: 3, r: 5 },
            // Body
            { q: -1, r: -1 }, { q: -1, r: -2 }, { q: -2, r: -1 },
            { q: -1, r: 2 }, { q: -2, r: 2 }, { q: -2, r: 1 },
            // Center Guard
            { q: -1, r: 0 }, { q: -2, r: 0 }, { q: -3, r: 0 },
            // Rear Extensions
            { q: -3, r: -1 }, { q: -3, r: 1 }, { q: -4, r: 0 }
        ]
    },
    [FORMATION_GYORIN]: {
        name: '魚鱗の陣',
        nameShort: '魚鱗',
        description: '攻撃-20 / 防御+20\n本陣を守る堅陣',
        atkMod: -20,
        defMod: 20,
        requiredSubordinates: 2,
        // Cluster around HQ
        slots: [
            // Ring 1
            { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
            // Ring 2
            { q: 2, r: 0 }, { q: 1, r: 1 }, { q: 0, r: 2 }, { q: -1, r: 2 }, { q: -2, r: 2 }, { q: -2, r: 1 },
            { q: -2, r: 0 }, { q: -1, r: -1 }, { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }, { q: 2, r: -1 },
            // Ring 3 (Front Heavy)
            { q: 3, r: 0 }, { q: 2, r: 1 }, { q: 1, r: 2 }, { q: 0, r: 3 }, { q: 3, r: -1 }, { q: 2, r: -3 },
            { q: -3, r: 0 }, { q: -3, r: 3 }, { q: -3, r: -3 }, { q: -1, r: 3 }, { q: -1, r: -3 }, { q: 1, r: -3 }
        ]
    }
};

/**
 * 陣形によるステータス修正を取得
 */
export function getFormationModifiers(formation) {
    if (!formation || !FORMATION_INFO[formation]) {
        return { atk: 0, def: 0 };
    }
    const info = FORMATION_INFO[formation];
    return { atk: info.atkMod, def: info.defMod };
}

/**
 * 座標を回転させる (Hex Grid Rotation)
 * @param {number} q 
 * @param {number} r 
 * @param {number} rotation 0-5 (60 degree steps clockwise)
 */
function rotateHex(q, r, rotation) {
    let nq = q;
    let nr = r;
    for (let i = 0; i < rotation; i++) {
        // Clockwise rotation: (q, r) -> (-r, q+r)
        const temp = nq;
        nq = -nr;
        nr = temp + nr;
    }
    return { q: nq, r: nr };
}

/**
 * 本陣と配下ユニットの陣形目標座標を計算
 * @param {Object} hq 本陣ユニット
 * @param {Array} subordinates 配下ユニットのリスト
 */
export function calculateFormationTargets(hq, subordinates) {
    const info = FORMATION_INFO[hq.formation];
    if (!info || !info.slots) return null;

    const targets = new Map(); // unitId -> {q, r}
    const dir = hq.dir !== undefined ? hq.dir : 0;

    // スロットを回転させて絶対座標に変換
    const availableSlots = info.slots.map(slot => {
        const rotated = rotateHex(slot.q, slot.r, dir);
        return {
            q: hq.q + rotated.q,
            r: hq.r + rotated.r
        };
    });

    // ユニットをスロットに割り当て
    // 単純にリスト順、あるいは距離順などで割り当てる
    // ここでは単純に配列の順番で割り当てる
    for (let i = 0; i < subordinates.length; i++) {
        if (i < availableSlots.length) {
            targets.set(subordinates[i].id, availableSlots[i]);
        } else {
            // スロットが足りない場合は本陣の周囲に適当に配置（あるいは本陣と同じ位置）
            targets.set(subordinates[i].id, { q: hq.q, r: hq.r });
        }
    }

    return targets;
}

/**
 * HEX座標の6方向（pointy-top hexagon）
 */
const HEX_DIRECTIONS = [
    { q: 1, r: 0 },   // 0: 東
    { q: 0, r: 1 },   // 1: 南東  
    { q: -1, r: 1 },  // 2: 南西
    { q: -1, r: 0 },  // 3: 西
    { q: 0, r: -1 },  // 4: 北西
    { q: 1, r: -1 }   // 5: 北東
];

/**
 * 進行方向から最も近い6方向のインデックスを取得
 * @param {number} fromQ - 開始Q座標
 * @param {number} fromR - 開始R座標
 * @param {number} toQ - 目標Q座標
 * @param {number} toR - 目標R座標
 * @returns {number} 0-5の方向インデックス
 */
function getDirectionIndex(fromQ, fromR, toQ, toR) {
    const dq = toQ - fromQ;
    const dr = toR - fromR;

    // 角度を計算（pixel座標系で）
    const fromPos = hexToPixel(fromQ, fromR);
    const toPos = hexToPixel(toQ, toR);
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;

    // 最も近い6方向に丸める（60度刻み、30度オフセット）
    const dirIndex = Math.round(angle / 60) % 6;
    return dirIndex;
}

/**
 * 進行方向の左右のHEXを取得
 * @param {number} hexQ - 基準HEX Q座標
 * @param {number} hexR - 基準HEX R座標
 * @param {number} dirIndex - 進行方向インデックス (0-5)
 * @returns {{left: {q, r}, right: {q, r}}} 左右のHEX座標
 */
function getLeftRightHexes(hexQ, hexR, dirIndex) {
    // 左: dirIndex + 1 (反時計回り)
    // 右: dirIndex - 1 (時計回り)
    const leftIndex = (dirIndex + 1) % 6;
    const rightIndex = (dirIndex - 1 + 6) % 6;

    return {
        left: {
            q: hexQ + HEX_DIRECTIONS[leftIndex].q,
            r: hexR + HEX_DIRECTIONS[leftIndex].r
        },
        right: {
            q: hexQ + HEX_DIRECTIONS[rightIndex].q,
            r: hexR + HEX_DIRECTIONS[rightIndex].r
        }
    };
}

/**
 * 陣形要件を満たすか判定
 * @param {Object} hqUnit - 本陣ユニット
 * @param {Array} subordinateUnits - 配下ユニット（本陣を除く）
 * @param {number} targetQ - 目標Q座標
 * @param {number} targetR - 目標R座標
 * @param {string} formation - 陣形 (HOKO/KAKUYOKU/GYORIN)
 * @returns {boolean} 移動可能ならtrue
 */
export function canMoveWithFormation(hqUnit, subordinateUnits, targetQ, targetR, formation) {
    console.log(`[canMoveWithFormation] ${hqUnit.name}: formation=${formation}, target=(${targetQ},${targetR}), subordinates=${subordinateUnits.length}`);

    if (!formation) return true; // 陣形未設定なら制限なし

    const info = FORMATION_INFO[formation];
    if (!info) return true;

    const requiredCount = info.requiredSubordinates;
    console.log(`[canMoveWithFormation] 必要配下数: ${requiredCount}`);

    if (requiredCount === 0) {
        console.log(`[canMoveWithFormation] 鋒矢なので制限なし`);
        return true; // 鋒矢は制限なし
    }

    // 本陣から目標への経路を取得
    const path = getLine(hqUnit.q, hqUnit.r, targetQ, targetR);
    console.log(`[canMoveWithFormation] 経路長: ${path.length}`);

    // 経路が2未満（つまり本陣と同じ位置）なら移動なしなのでOK
    if (path.length < 2) return true;

    // 各経路HEXで左右の配下ユニット数をチェック
    for (let i = 1; i < path.length; i++) {
        const currentHex = path[i];
        const prevHex = path[i - 1];

        // 進行方向を計算
        const dirIndex = getDirectionIndex(prevHex.q, prevHex.r, currentHex.q, currentHex.r);

        // 現在のHEXとその左右を取得
        const { left, right } = getLeftRightHexes(currentHex.q, currentHex.r, dirIndex);

        // この3つのHEXに配下ユニットが何体いるかカウント
        const unitsInRange = subordinateUnits.filter(u =>
            !u.dead &&
            (
                (u.q === currentHex.q && u.r === currentHex.r) ||
                (u.q === left.q && u.r === left.r) ||
                (u.q === right.q && u.r === right.r)
            )
        );

        console.log(`[canMoveWithFormation] 経路${i}/${path.length - 1}: hex=(${currentHex.q},${currentHex.r}), 左=(${left.q},${left.r}), 右=(${right.q},${right.r}), 配下=${unitsInRange.length}/${requiredCount}`);

        // 必要数に満たない場合は移動不可
        if (unitsInRange.length < requiredCount) {
            console.log(`[canMoveWithFormation] ❌ 移動不可: 配下不足`);
            return false;
        }
    }

    console.log(`[canMoveWithFormation] ✅ 移動可能`);
    return true;
}

/**
 * 配下ユニット数に基づいて選択可能な陣形を取得
 * @param {number} subordinateCount - 配下ユニット数（本陣を除く）
 * @returns {Array<string>} 選択可能な陣形の配列
 */
export function getAvailableFormations(subordinateCount) {
    const available = [];

    // 鋒矢は常に選択可能
    available.push(FORMATION_HOKO);

    // 配下が1以上なら鶴翼も選択可能
    if (subordinateCount >= 1) {
        available.push(FORMATION_KAKUYOKU);
    }

    // 配下が2以上なら魚鱗も選択可能
    if (subordinateCount >= 2) {
        available.push(FORMATION_GYORIN);
    }

    return available;
}

/**
 * 本陣兵力に基づいて強制的に陣形を変更する必要があるかチェック
 * @param {number} hqSoldiers - 本陣の兵力
 * @param {string} currentFormation - 現在の陣形
 * @returns {{needsChange: boolean, newFormation: string|null}} 変更が必要ならnewFormationに陣形を返す
 */
export function checkForcedFormationChange(hqSoldiers, currentFormation) {
    // 500以下 → 魚鱗に強制変更
    if (hqSoldiers <= 500) {
        if (currentFormation !== FORMATION_GYORIN) {
            return { needsChange: true, newFormation: FORMATION_GYORIN };
        }
    }
    // 800以下 → 鶴翼に強制変更
    else if (hqSoldiers <= 800) {
        if (currentFormation !== FORMATION_GYORIN && currentFormation !== FORMATION_KAKUYOKU) {
            return { needsChange: true, newFormation: FORMATION_KAKUYOKU };
        }
    }

    return { needsChange: false, newFormation: null };
}
