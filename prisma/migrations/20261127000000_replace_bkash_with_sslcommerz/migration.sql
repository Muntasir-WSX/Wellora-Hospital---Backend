DO $$
BEGIN
    IF to_regclass('"payments"') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE "payments" RENAME COLUMN "bkashPaymentId" TO "gatewayPaymentId";
    ALTER TABLE "payments" RENAME COLUMN "bkashTrxId" TO "gatewayTransactionId";
    ALTER TABLE "payments" RENAME COLUMN "refundTrxId" TO "gatewayRefundId";
    ALTER TABLE "payments" ALTER COLUMN "paymentGateway" DROP DEFAULT;

    CREATE TYPE "PaymentGateway_new" AS ENUM ('SSLCOMMERZ', 'LEGACY');
    ALTER TABLE "payments"
        ALTER COLUMN "paymentGateway" TYPE "PaymentGateway_new"
        USING (
            CASE
                WHEN "paymentGateway"::text = 'BKASH' THEN 'LEGACY'
                ELSE "paymentGateway"::text
            END
        )::"PaymentGateway_new";
    DROP TYPE "PaymentGateway";
    ALTER TYPE "PaymentGateway_new" RENAME TO "PaymentGateway";
    ALTER TABLE "payments"
        ALTER COLUMN "paymentGateway" SET DEFAULT 'SSLCOMMERZ';

    IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'PaymentStatus'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'PaymentStatus'
          AND e.enumlabel = 'REFUND_PENDING'
    ) THEN
        ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_PENDING';
    END IF;
END $$;
