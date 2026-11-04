-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shopName" TEXT NOT NULL DEFAULT 'My Shop',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "footerMessage" TEXT NOT NULL DEFAULT 'Thank you! Visit again.',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV-',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "defaultPayment" TEXT NOT NULL DEFAULT 'CASH',
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxMode" TEXT NOT NULL DEFAULT 'INTRA',
    "roundOff" BOOLEAN NOT NULL DEFAULT true,
    "paperSize" INTEGER NOT NULL DEFAULT 80,
    "printerName" TEXT NOT NULL DEFAULT '',
    "fontSize" INTEGER NOT NULL DEFAULT 12,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "autoPreview" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "scope" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL DEFAULT '',
    "customerMobile" TEXT NOT NULL DEFAULT '',
    "customerAddress" TEXT NOT NULL DEFAULT '',
    "shopSnapshot" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "itemDiscount" INTEGER NOT NULL,
    "billDiscount" INTEGER NOT NULL,
    "taxableAmount" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL DEFAULT 0,
    "sgst" INTEGER NOT NULL DEFAULT 0,
    "igst" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL,
    "otherCharges" INTEGER NOT NULL,
    "roundOff" INTEGER NOT NULL,
    "grandTotal" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amountPaid" INTEGER NOT NULL,
    "balanceDue" INTEGER NOT NULL,
    "changeGiven" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "billStatus" "BillStatus" NOT NULL DEFAULT 'COMPLETED',
    "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "voidReason" TEXT,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "grossAmount" INTEGER NOT NULL,
    "taxableAmount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintLog" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_invoiceNumber_key" ON "Bill"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_idempotencyKey_key" ON "Bill"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Bill_invoiceDate_idx" ON "Bill"("invoiceDate");

-- CreateIndex
CREATE INDEX "Bill_customerMobile_idx" ON "Bill"("customerMobile");

-- CreateIndex
CREATE INDEX "Bill_customerName_idx" ON "Bill"("customerName");

-- CreateIndex
CREATE INDEX "Bill_billStatus_paymentStatus_idx" ON "Bill"("billStatus", "paymentStatus");

-- CreateIndex
CREATE INDEX "Bill_paymentMethod_idx" ON "Bill"("paymentMethod");

-- CreateIndex
CREATE INDEX "BillItem_billId_idx" ON "BillItem"("billId");

-- CreateIndex
CREATE INDEX "BillItem_itemName_idx" ON "BillItem"("itemName");

-- CreateIndex
CREATE INDEX "BillItem_itemCode_idx" ON "BillItem"("itemCode");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");

-- CreateIndex
CREATE INDEX "PrintLog_billId_idx" ON "PrintLog"("billId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintLog" ADD CONSTRAINT "PrintLog_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
