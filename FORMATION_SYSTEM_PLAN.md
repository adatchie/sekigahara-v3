# 陣形システム実装計画

## 概要
CPU側の本陣ユニットが先陣を切って突出する問題を解決するため、陣形システムを導入します。
各武将は目標設定時に陣形（鋒矢・鶴翼・魚鱗）を選択でき、陣形に応じて移動制限とステータス修正が適用されます。

---

## 1. 陣形の種類と効果

### 1.1 陣形タイプ
```javascript
// 陣形定数（constants.js に追加）
export const FORMATION_HOKO = 'HOKO';     // 鋒矢の陣
export const FORMATION_KAKUYOKU = 'KAKUYOKU'; // 鶴翼の陣
export const FORMATION_GYORIN = 'GYORIN';   // 魚鱗の陣
```

### 1.2 陣形効果一覧
| 陣形 | 攻撃修正 | 防御修正 | 前方配下要件 | 特徴 |
|------|----------|----------|--------------|------|
| 鋒矢 | +20 | -20 | 0以上 | 攻撃的・本陣前方 |
| 鶴翼 | ±0 | ±0 | 1以上 | バランス型・本陣中央 |
| 魚鱗 | -20 | +20 | 2以上 | 防御的・本陣後方 |

### 1.3 配下ユニット数による制限
- 配下ユニット数 < 1: 鶴翼・魚鱗を選択不可（鋒矢のみ）
- 配下ユニット数 < 2: 魚鱗を選択不可

---

## 2. UI実装

### 2.1 陣形選択パネル
**場所**: 本陣ユニット選択時に表示される新規パネル
**位置**: 画面右側（既存のコンテキストメニューとは別）

**パネル構成**:
- タイトル: 「陣形選択」
- 3つの陣形ボタン（鋒矢・鶴翼・魚鱗）
- 各ボタンにマウスオーバーで説明を表示
- 現在選択中の陣形をハイライト表示
- 選択不可の陣形はグレーアウト

**説明テキスト**（マウスオーバー時）:
- **鋒矢の陣**: 「攻撃+20 / 防御-20 / 先陣を切って攻める」
- **鶴翼の陣**: 「攻撃±0 / 防御±0 / バランス型の陣形」
- **魚鱗の陣**: 「攻撃-20 / 防御+20 / 本陣を守る堅陣」

### 2.2 HTML/CSS追加
```html
<!-- sekigahara.html に追加 -->
<div id="formation-panel" class="hud-panel" style="display:none;">
    <div style="font-size:14px; margin-bottom:10px; border-bottom:1px solid #888; padding-bottom:5px;">陣形選択</div>
    <div id="formation-buttons"></div>
    <div id="formation-tooltip" style="font-size:11px; color:#aaa; margin-top:10px; min-height:40px;"></div>
</div>
```

---

## 3. データ構造の拡張

### 3.1 ユニットデータに追加
```javascript
// unit-manager.js のユニット作成時に追加
{
    // 既存フィールド...
    formation: null,  // 現在の陣形 (HOKO/KAKUYOKU/GYORIN/null)
}
```

### 3.2 武将グループデータ（UnitManager内）
```javascript
// warlordGroupsに陣形情報を追加管理
this.warlordFormations = {}; // warlordId -> formation のマップ
```

---

## 4. 移動制限ロジック

### 4.1 進行方向の判定
**実装場所**: `pathfinding.js` または新規 `formation.js`

```javascript
/**
 * 本陣から目標への進行方向を計算
 * @param {Object} hqUnit - 本陣ユニット
 * @param {Object} target - 目標（ユニットまたは座標）
 * @returns {Array<{q, r}>} - 進行経路上のHEX座標配列
 */
function getPathToTarget(hqUnit, target) {
    // A*アルゴリズムまたは直線補間で経路を取得
}

/**
 * 進行方向の左右のHEXを取得
 * @param {number} q1, r1 - 基準HEX
 * @param {number} q2, r2 - 進行方向の次のHEX
 * @returns {{left: {q, r}, right: {q, r}}} - 左右のHEX
 */
function getLeftRightHexes(q1, r1, q2, r2) {
    // HEX座標系での左右を計算
}
```

### 4.2 配下ユニットの配置確認
```javascript
/**
 * 陣形要件を満たすか判定
 * @param {Object} hqUnit - 本陣ユニット
 * @param {Array} subordinateUnits - 配下ユニット
 * @param {Object} target - 目標
 * @param {string} formation - 陣形
 * @returns {boolean} - 移動可能ならtrue
 */
function canMoveWithFormation(hqUnit, subordinateUnits, target, formation) {
    const path = getPathToTarget(hqUnit, target);
    const requiredCount = getFormationRequirement(formation); // 0, 1, 2
    
    // 各経路HEXとその左右に配下ユニットが何体いるか確認
    for (const hex of path) {
        const {left, right} = getLeftRightHexes(hex.q, hex.r, nextHex.q, nextHex.r);
        const unitsInRange = subordinateUnits.filter(u => 
            (u.q === hex.q && u.r === hex.r) ||
            (u.q === left.q && u.r === left.r) ||
            (u.q === right.q && u.r === right.r)
        );
        
        if (unitsInRange.length < requiredCount) {
            return false; // 配下が足りない
        }
    }
    
    return true;
}
```

---

## 5. ステータス修正の適用

### 5.1 戦闘計算への組み込み
**実装場所**: `combat.js` の `executeCombat` 関数内

```javascript
// 陣形によるステータス修正を取得
function getFormationModifiers(unit) {
    if (!unit.formation) return {atk: 0, def: 0};
    
    switch(unit.formation) {
        case FORMATION_HOKO:
            return {atk: 20, def: -20};
        case FORMATION_KAKUYOKU:
            return {atk: 0, def: 0};
        case FORMATION_GYORIN:
            return {atk: -20, def: 20};
        default:
            return {atk: 0, def: 0};
    }
}

// 戦闘計算時に適用
const atkMod = getFormationModifiers(attacker);
const defMod = getFormationModifiers(defender);
const finalAtk = attacker.atk + atkMod.atk;
const finalDef = defender.def + defMod.def;
```

---

## 6. CPU AIの陣形選択

### 6.1 判定ロジック
**実装場所**: `ai.js` に新規メソッド追加

```javascript
/**
 * CPUの陣形を決定
 * @param {Object} hqUnit - 本陣ユニット
 * @param {number} warlordId - 武将ID
 * @param {Array} allUnits - 全ユニット
 * @returns {string} - 選択する陣形
 */
decideFormation(hqUnit, warlordId, allUnits) {
    // 1. 本陣兵力による強制陣形
    if (hqUnit.soldiers <= 500) {
        return FORMATION_GYORIN; // 魚鱗
    }
    if (hqUnit.soldiers <= 800) {
        return FORMATION_KAKUYOKU; // 鶴翼
    }
    
    // 2. 周囲5HEX以内の敵味方兵力を計算
    const radius = 5;
    const {friendly, enemy} = this.countNearbyForces(hqUnit, allUnits, radius);
    
    // 3. 兵力比率で判定
    const ratio = friendly / (enemy || 1);
    
    if (ratio >= 1.5) {
        return FORMATION_HOKO;      // 鋒矢（優勢）
    } else if (ratio <= 0.67) {
        return FORMATION_GYORIN;    // 魚鱗（劣勢）
    } else {
        return FORMATION_KAKUYOKU;  // 鶴翼（拮抗）
    }
}

/**
 * 周囲の兵力を計算
 */
countNearbyForces(hqUnit, allUnits, radius) {
    let friendly = 0;
    let enemy = 0;
    
    for (const unit of allUnits) {
        if (unit.dead) continue;
        
        const dist = hexDistance(hqUnit.q, hqUnit.r, unit.q, unit.r);
        if (dist <= radius) {
            if (unit.side === hqUnit.side) {
                friendly += unit.soldiers;
            } else {
                enemy += unit.soldiers;
            }
        }
    }
    
    return {friendly, enemy};
}
```

### 6.2 陣形の更新タイミング
- **プレイヤー**: 目標設定フェーズで手動選択
- **CPU**: 各ターン開始時に自動判定・更新

---

## 7. 実装ファイル一覧

### 7.1 新規ファイル
- **`scripts/formation.js`**: 陣形関連のロジック（移動判定、左右HEX計算など）

### 7.2 修正ファイル
1. **`scripts/constants.js`**: 陣形定数の追加
2. **`scripts/unit-manager.js`**: ユニットデータに`formation`フィールド追加
3. **`scripts/main.js`**: UI表示・陣形選択イベント処理
4. **`scripts/ai.js`**: CPU陣形判定ロジック追加
5. **`scripts/combat.js`**: ステータス修正の適用
6. **`scripts/pathfinding.js`**: 移動可否判定（または`formation.js`で実装）
7. **`sekigahara.html`**: 陣形選択パネルのHTML/CSS追加

---

## 8. 実装順序

### Phase 1: データ構造とUI（Step 1-3）
1. `constants.js` に陣形定数を追加
2. `unit-manager.js` にformationフィールド追加
3. `sekigahara.html` に陣形選択パネルのUI追加
4. `main.js` にUI表示ロジック追加

### Phase 2: 陣形ロジック（Step 4-6）
5. `formation.js` を新規作成（移動判定ロジック）
6. `combat.js` にステータス修正を追加
7. `main.js` に移動制限の統合

### Phase 3: CPU AI（Step 7-8）
8. `ai.js` に陣形判定メソッド追加
9. CPU陣形自動選択の統合

### Phase 4: テストと調整（Step 9-10）
10. 動作確認とバランス調整

---

## 9. テスト項目

### 9.1 機能テスト
- [ ] 本陣選択時に陣形パネルが表示される
- [ ] 配下ユニット数に応じて選択不可陣形がグレーアウトされる
- [ ] 陣形選択時にステータスが正しく修正される
- [ ] 陣形要件を満たさない場合、本陣が移動しない
- [ ] CPU AIが状況に応じて適切な陣形を選択する
- [ ] 本陣兵力800以下で鶴翼、500以下で魚鱗に強制変更される

### 9.2 バランステスト
- [ ] ±20の修正値が適切か（ピーキーすぎないか）
- [ ] CPU AIの陣形選択が戦術的に妥当か
- [ ] 移動制限が厳しすぎないか

---

## 10. 今後の拡張案

- 陣形ごとの視覚的表現（配下ユニットの配置が変わるなど）
- より多様な陣形の追加（長槍の陣、車懸りの陣など）
- 陣形の練度システム（使い続けると効果アップ）
- 陣形破りの概念（特定の陣形に有利不利）

---

## 11. 注意事項

### パフォーマンス
- 移動判定で全経路の配下ユニットをチェックするため、計算コストが増加
- 必要に応じてキャッシュやLOD（詳細度）の調整が必要

### ユーザビリティ
- 陣形の効果がわかりやすいよう、UI上で視覚的にフィードバック
- マウスオーバー説明を充実させる

### AI調整
- 陣形選択が単調にならないよう、武将の性格（P_BRAVE等）も考慮可能
- 例: 勇猛な武将は鋒矢を選びやすい、など

---

以上が陣形システムの実装計画です。
