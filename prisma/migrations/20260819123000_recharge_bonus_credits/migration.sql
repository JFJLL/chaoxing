ALTER TABLE "PaymentOrder" ADD COLUMN "planBaseCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaymentOrder" ADD COLUMN "planBonusCredits" INTEGER NOT NULL DEFAULT 0;

-- 历史订单在原规则下没有优惠赠送，全部积分均归为基础付费积分。
UPDATE "PaymentOrder"
SET "planBaseCredits" = "planCredits"
WHERE "planBaseCredits" = 0;
