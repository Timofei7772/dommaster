# KP Canonical Finance Base Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Перевести финансовые расчеты КП на каноническую базу сметы и оставить `items` только для отображения и контролируемого fallback.

**Architecture:** `useEstimateFinance` должен принимать агрегированные базовые стоимости сметы и использовать их как primary source of truth. `items` остаются для UI, PDF и fallback-расчета, если канонические поля сметы отсутствуют. UI должен показывать предупреждения о fallback и рассинхроне базы сметы с позициями.

**Tech Stack:** React, TypeScript, node:test, Vite

---

### Task 1: Add failing regression tests for canonical base and fallback

**Files:**
- Modify: `frontend/src/hooks/useEstimateFinance.test.ts`

**Step 1: Write the failing test**

Добавить кейсы:
- расчёт использует `baseWorksCost/baseMaterialsCost/baseMachinesCost`, а не суммы `items`
- расчёт переключается на `items` fallback и сообщает об этом

**Step 2: Run test to verify it fails**

Run: `node --test .\src\hooks\useEstimateFinance.test.ts`

**Step 3: Write minimal implementation**

Добавить новые поля в `FinanceParams` и `FinanceResult`, затем пересчитать базу через канонические поля с fallback на `items`.

**Step 4: Run test to verify it passes**

Run: `node --test .\src\hooks\useEstimateFinance.test.ts`

### Task 2: Wire canonical estimate base into KP modal

**Files:**
- Modify: `frontend/src/components/KPPreviewModal.tsx`

**Step 1: Pass canonical base into finance hook**

Пробросить `estimate.labor_cost`, `estimate.materials_cost`, `estimate.machines_cost`.

**Step 2: Show warnings**

Показать предупреждение при fallback и предупреждение при заметном рассинхроне базы сметы с позициями.

**Step 3: Verify locally**

Run: `npx eslint .\src\hooks\useEstimateFinance.ts .\src\hooks\useEstimateFinance.test.ts .\src\components\KPPreviewModal.tsx --max-warnings 0`

### Task 3: Final verification

**Files:**
- Modify: `frontend/src/hooks/useEstimateFinance.ts`
- Modify: `frontend/src/hooks/useEstimateFinance.test.ts`
- Modify: `frontend/src/components/KPPreviewModal.tsx`

**Step 1: Run focused tests**

Run: `node --test .\src\hooks\useEstimateFinance.test.ts`

**Step 2: Run build**

Run: `npm run build`
