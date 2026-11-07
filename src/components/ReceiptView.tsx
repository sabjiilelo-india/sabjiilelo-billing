import { PAYMENT_LABELS, paperContentMm } from "@/lib/constants";
import { formatNum } from "@/lib/money";
import { formatDateTime } from "@/lib/client";
import type { BillDto } from "@/lib/types";
import ThermalLogo from "./ThermalLogo";

interface Props {
  bill: BillDto;
  paperSize: number;
  fontSize: number;
  logo?: string;
  onLogoReady?: () => void;
}

const qtyText = (q: string | number) => String(Number(q));

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{left}</span>
      <span className="whitespace-nowrap">{right}</span>
    </div>
  );
}

/** Black-and-white thermal receipt. Width is the paper width; height grows with content. */
export default function ReceiptView({ bill, paperSize, fontSize, logo, onLogoReady }: Props) {
  const shop = bill.shopSnapshot;
  const voided = bill.billStatus === "VOIDED";
  const width = `${paperContentMm(paperSize)}mm`;
  const size = paperSize <= 58 ? Math.min(fontSize, 11) : paperSize >= 148 ? fontSize + 2 : fontSize;
  const discountTotal = bill.itemDiscount + bill.billDiscount;
  // Logo takes half the printable width (24-50 mm): big enough to read, small enough to save paper.
  const logoMm = Math.min(50, Math.max(24, Math.round(paperContentMm(paperSize) / 2)));

  return (
    <div
      style={{ width, fontSize: `${size}px`, lineHeight: 1.3 }}
      className="mx-auto bg-white p-0 font-mono text-black"
    >
      <div className="text-center">
        {logo && <ThermalLogo src={logo} widthMm={logoMm} onReady={onLogoReady} />}
        <div className="break-words text-[1.2em] font-bold uppercase">{shop.shopName}</div>
        {shop.address && <div className="whitespace-pre-line break-words">{shop.address}</div>}
        {shop.phone && <div>Ph: {shop.phone}</div>}
        {shop.gstin && <div>GSTIN: {shop.gstin}</div>}
      </div>

      {voided && <div className="my-1 border-2 border-black py-0.5 text-center font-bold tracking-widest">*** CANCELLED ***</div>}

      <hr className="my-1 border-dashed border-black" />
      <Row left="Invoice" right={bill.invoiceNumber} bold />
      <div>{formatDateTime(bill.invoiceDate, shop.timeZone)}</div>
      {bill.customerName && <div className="break-words">Customer: {bill.customerName}</div>}
      {bill.customerMobile && <div>Mobile: {bill.customerMobile}</div>}
      <hr className="my-1 border-dashed border-black" />

      {bill.items.map((it, i) => (
        <div key={it.id} className="mb-1" style={{ breakInside: "avoid" }}>
          <div className="break-words font-bold">
            {i + 1}. {it.itemName}
            {it.itemCode ? ` (${it.itemCode})` : ""}
          </div>
          <Row
            left={`${qtyText(it.quantity)} ${it.unit} x ${formatNum(it.unitPrice)}`}
            right={formatNum(it.grossAmount)}
          />
          {it.discountAmount > 0 && <Row left="  Discount" right={`-${formatNum(it.discountAmount)}`} />}
          {bill.taxEnabled && it.taxRate > 0 && (
            <Row left={`  Tax ${it.taxRate / 100}%`} right={`+${formatNum(it.taxAmount)}`} />
          )}
        </div>
      ))}

      <hr className="my-1 border-dashed border-black" />
      <Row left="Subtotal" right={formatNum(bill.subtotal)} />
      {discountTotal > 0 && <Row left="Discount" right={`-${formatNum(discountTotal)}`} />}
      {bill.taxEnabled && bill.taxAmount > 0 && (
        <>
          <Row left="Taxable" right={formatNum(bill.taxableAmount)} />
          {bill.igst > 0 ? (
            <Row left="IGST" right={formatNum(bill.igst)} />
          ) : (
            <>
              <Row left="CGST" right={formatNum(bill.cgst)} />
              <Row left="SGST" right={formatNum(bill.sgst)} />
            </>
          )}
        </>
      )}
      {bill.otherCharges > 0 && <Row left="Other charges" right={formatNum(bill.otherCharges)} />}
      {bill.roundOff !== 0 && <Row left="Round off" right={formatNum(bill.roundOff)} />}
      <hr className="my-1 border-black" />
      <div className="flex justify-between text-[1.25em] font-bold">
        <span>TOTAL</span>
        <span>{"₹"}{formatNum(bill.grandTotal)}</span>
      </div>
      <hr className="my-1 border-black" />
      <Row left="Payment" right={PAYMENT_LABELS[bill.paymentMethod] ?? bill.paymentMethod} />
      <Row left="Paid" right={formatNum(bill.amountPaid)} />
      {bill.changeGiven > 0 && <Row left="Change" right={formatNum(bill.changeGiven)} />}
      {bill.balanceDue > 0 && <Row left="Balance due" right={formatNum(bill.balanceDue)} bold />}
      {voided && bill.voidReason && <div className="mt-1 break-words">Reason: {bill.voidReason}</div>}

      {shop.footerMessage && (
        <>
          <hr className="my-1 border-dashed border-black" />
          <div className="whitespace-pre-line break-words text-center">{shop.footerMessage}</div>
        </>
      )}
    </div>
  );
}
