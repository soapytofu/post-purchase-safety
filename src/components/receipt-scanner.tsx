"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Camera, Check, FileImage, LoaderCircle, Plus, ReceiptText, RotateCcw, ScanLine, Trash2, Upload } from "lucide-react";
import { importReceiptPurchases } from "@/app/actions";
import { parseReceiptText, type ReceiptLineItem } from "@/lib/receipt-parser";
import { ReceiptCamera } from "./receipt-camera";
import { isValidGtin } from "@/lib/receipt-import";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
async function* receiptImages(file: File) {
  if (file.type !== "application/pdf") {
    const url = URL.createObjectURL(file);
    yield { source: url, page: 1, pages: 1 };
    return;
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    if (pdf.numPages > 10) throw new Error("Upload a PDF with 10 pages or fewer, or split it into smaller files.");
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2.5, 2200 / baseViewport.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      page.cleanup();
      yield { source: dataUrl, page: pageNumber, pages: pdf.numPages };
    }
  } finally { await pdf.destroy(); }
}

function SaveButton({ count, invalidBarcode }: { count: number; invalidBarcode: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending || count === 0 || invalidBarcode}>{pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{pending ? "Saving and checking…" : `Save & check ${count} item${count === 1 ? "" : "s"}`}</button>;
}

export function ReceiptScanner() {
  const uploadRef = useRef<HTMLInputElement>(null);
  const jobRef = useRef(0);
  const previewRef = useRef("");
  useEffect(() => () => { jobRef.current++; if (previewRef.current.startsWith("blob:")) URL.revokeObjectURL(previewRef.current); }, []);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [merchant, setMerchant] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [items, setItems] = useState<ReceiptLineItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Choose a clear, flat receipt image.");
  const [error, setError] = useState("");

  const selectedItems = items.filter((item) => item.selected && item.productName.trim());
  const payload = useMemo(() => JSON.stringify({ merchant, purchaseDate, items: selectedItems.map(({ productName, brand, category, upc, lotNumber }) => ({ productName, brand, category, upc, lotNumber })) }), [merchant, purchaseDate, selectedItems]);

  function reset() {
    jobRef.current++;
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    previewRef.current = "";
    setProcessing(false); setFileName(""); setPreview(""); setMerchant(""); setPurchaseDate(""); setItems([]); setProgress(0); setError(""); setStatus("Choose a clear, flat receipt image.");
    if (uploadRef.current) uploadRef.current.value = "";
  }

  async function processReceipt(file?: File) {
    if (!file) return;
    setError("");
    if (!acceptedTypes.includes(file.type)) { setError("Use a PDF, JPG, PNG, or WebP receipt."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Receipt files must be 10 MB or smaller."); return; }
    const job = ++jobRef.current;
    const current = () => jobRef.current === job;
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    previewRef.current = "";
    setPreview(""); setItems([]); setMerchant(""); setPurchaseDate("");
    setProcessing(true); setProgress(0.04); setFileName(file.name || "Camera receipt"); setStatus("Preparing receipt…");
    try {
      const { recognize } = await import("tesseract.js");
      const texts: string[] = [];
      let pageCount = 1;
      for await (const image of receiptImages(file)) {
        if (!current()) { if (image.source.startsWith("blob:")) URL.revokeObjectURL(image.source); return; }
        pageCount = image.pages;
        if (image.page === 1) { previewRef.current = image.source; setPreview(image.source); }
        const result = await recognize(image.source, "eng", { logger: (message) => {
          if (!current()) return;
          if (message.status === "recognizing text") setProgress((image.page - 1 + message.progress) / image.pages);
          setStatus(message.status === "recognizing text" ? `Reading page ${image.page} of ${image.pages}… ${Math.round(message.progress * 100)}%` : "Preparing text reader…");
        } });
        if (!current()) return;
        texts.push(result.data.text);
      }
      if (!current()) return;
      const parsed = parseReceiptText(texts.join("\n"));
      setMerchant(parsed.merchant);
      setPurchaseDate(parsed.purchaseDate);
      setItems(parsed.items.length ? parsed.items : [emptyItem("receipt-1")]);
      setProgress(1);
      setStatus(parsed.items.length ? `${parsed.items.length} likely item${parsed.items.length === 1 ? "" : "s"} found across ${pageCount} page${pageCount === 1 ? "" : "s"}. Review before saving.${parsed.items.length === 40 ? " Detection is limited to 40 items; check for omitted lines." : ""}` : "No line items were confidently detected. Add or edit the item below.");
    } catch (cause) {
      if (!current()) return;
      setError(cause instanceof Error && cause.message.startsWith("Upload a PDF") ? cause.message : "This receipt could not be read. Try a brighter, straighter image or another file.");
      setStatus("Receipt processing stopped.");
    } finally { if (current()) setProcessing(false); }
  }

  function updateItem(id: string, patch: Partial<ReceiptLineItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addItem() {
    setItems((current) => [...current, emptyItem(`receipt-${crypto.randomUUID()}`)]);
  }

  return <section className="receipt-card">
    <div className="receipt-intro"><span className="receipt-icon"><ReceiptText size={24} /></span><div><p className="eyebrow">Fast receipt capture</p><h2>Scan a receipt</h2><p>Upload a file or use your phone camera. SafeKeep reads it on this device, then lets you confirm every item before saving.</p></div><span className="local-badge">Image stays local</span></div>
    {!fileName && <div className="receipt-capture" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void processReceipt(event.dataTransfer.files[0]); }}>
      <ScanLine size={34} /><strong>Drop a receipt here</strong><span>PDF, JPG, PNG, or WebP · up to 10 MB · PDFs up to 10 pages</span>
      <div className="receipt-actions"><button className="button button-primary" type="button" onClick={() => uploadRef.current?.click()}><Upload size={16} />Upload receipt</button><button className="button button-secondary" type="button" onClick={() => setCameraOpen(true)}><Camera size={16} />Scan with camera</button></div>
      <input ref={uploadRef} className="visually-hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void processReceipt(event.target.files?.[0])} />
    </div>}
    {error && !fileName && <p className="inline-error" role="alert">{error}</p>}
    {cameraOpen && <ReceiptCamera onClose={() => setCameraOpen(false)} onCapture={file => { setCameraOpen(false); void processReceipt(file); }} onUpload={() => { setCameraOpen(false); uploadRef.current?.click(); }} />}
    {fileName && <div className="receipt-workspace">
      <aside className="receipt-preview"><div className="receipt-file"><FileImage size={15} /><span>{fileName}</span><button type="button" onClick={reset} aria-label="Choose another receipt"><RotateCcw size={14} /></button></div>{preview ? <Image src={preview} alt="Receipt selected for review" width={1200} height={1600} unoptimized /> : <div className="receipt-preview-loading"><LoaderCircle className="spin" /></div>}</aside>
      <div className="receipt-review">
        <div className="scan-status" aria-live="polite"><div><span style={{ width: `${Math.max(4, progress * 100)}%` }} /></div><p>{status}</p></div>
        {error && <div className="inline-error">{error}</div>}
        {!processing && items.length > 0 && <form action={importReceiptPurchases} className="receipt-form">
          <input type="hidden" name="receiptPayload" value={payload} />
          <div className="receipt-fields"><label>Retailer *<input value={merchant} onChange={(event) => setMerchant(event.target.value)} required placeholder="Store name" /></label><label>Purchase date *<input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></label></div>
          {!purchaseDate && <p className="inline-error" role="status">We couldn’t read the purchase date. Enter the date from your receipt before saving.</p>}
          <p className="receipt-evidence-help">Brand is optional; don’t guess. Add the brand and barcode from the package when available. Missing identifying details limit matching; name-only matches may not qualify for email alerts. Printed receipt codes may be store SKUs, not barcodes.</p>
          <div className="receipt-items-heading"><div><strong>Detected purchases</strong><span>Uncheck totals, discounts, or anything that isn’t a product.</span></div><button type="button" onClick={addItem}><Plus size={14} />Add item</button></div>
          <div className="receipt-items">{items.map((item, index) => <div className={`receipt-item${item.selected ? "" : " deselected"}`} key={item.id}>
            <label className="receipt-check"><input type="checkbox" checked={item.selected} onChange={(event) => updateItem(item.id, { selected: event.target.checked })} /><span>{index + 1}</span></label>
            <label>Product<input value={item.productName} onChange={(event) => updateItem(item.id, { productName: event.target.value })} required={item.selected} placeholder="Product name" /></label>
            <label>Brand (optional)<input value={item.brand} onChange={(event) => updateItem(item.id, { brand: event.target.value })} placeholder="Unknown — check package" /></label>
            <label>Category<input value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })} required={item.selected} /></label>
            <span className="receipt-price">{item.price ? `$${item.price}` : "—"}</span>
            <button className="receipt-remove" type="button" aria-label={`Remove ${item.productName || "item"}`} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}><Trash2 size={15} /></button>
            <div className="receipt-identifiers">
              {item.rawLine && <details><summary>Original receipt line</summary><p>{item.rawLine}</p></details>}
              {item.printedCode && <p>Printed code: <code>{item.printedCode}</code> · verify on the package.{isValidGtin(item.printedCode) && <button type="button" onClick={() => updateItem(item.id, { upc: item.printedCode })}>Use as barcode after checking package</button>}</p>}
              <div><label>Confirmed UPC / GTIN<input value={item.upc} disabled={!item.selected} aria-invalid={Boolean(item.upc && !isValidGtin(item.upc))} inputMode="numeric" pattern="(?:[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})" placeholder="Package barcode, not store SKU" onChange={event => updateItem(item.id, { upc: event.target.value })} /></label><label>Lot number (optional)<input value={item.lotNumber} maxLength={80} placeholder="Printed on package" onChange={event => updateItem(item.id, { lotNumber: event.target.value })} /></label></div>
              {item.selected && item.upc && !isValidGtin(item.upc) && <p className="inline-error" role="status">Check the barcode length and check digit, or leave it blank.</p>}
            </div>
          </div>)}</div>
          <div className="receipt-submit"><p>SafeKeep will compare the selected items with synchronized safety notices.</p><SaveButton count={selectedItems.length} invalidBarcode={selectedItems.some(item => Boolean(item.upc && !isValidGtin(item.upc)))} /></div>
        </form>}
      </div>
    </div>}
  </section>;
}

function emptyItem(id: string): ReceiptLineItem {
  return { id, productName: "", brand: "", category: "Uncategorized", price: "", selected: true, rawLine: "", printedCode: "", upc: "", lotNumber: "" };
}
