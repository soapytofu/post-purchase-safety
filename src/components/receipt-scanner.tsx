"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Camera, Check, FileImage, LoaderCircle, Plus, ReceiptText, RotateCcw, ScanLine, Trash2, Upload } from "lucide-react";
import { importReceiptPurchases } from "@/app/actions";
import { parseReceiptText, type ReceiptLineItem } from "@/lib/receipt-parser";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const today = () => new Date().toISOString().slice(0, 10);

async function imageSource(file: File): Promise<{ source: string; preview: string }> {
  if (file.type !== "application/pdf") {
    const url = URL.createObjectURL(file);
    return { source: url, preview: url };
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2.5, 2200 / baseViewport.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  await pdf.destroy();
  return { source: dataUrl, preview: dataUrl };
}

function SaveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending || count === 0}>{pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{pending ? "Saving and checking…" : `Save & check ${count} item${count === 1 ? "" : "s"}`}</button>;
}

export function ReceiptScanner() {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [merchant, setMerchant] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [items, setItems] = useState<ReceiptLineItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Choose a clear, flat receipt image.");
  const [error, setError] = useState("");

  const selectedItems = items.filter((item) => item.selected && item.productName.trim());
  const payload = useMemo(() => JSON.stringify({ merchant, purchaseDate, items: selectedItems.map(({ productName, brand, category }) => ({ productName, brand, category })) }), [merchant, purchaseDate, selectedItems]);

  function reset() {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFileName(""); setPreview(""); setMerchant(""); setPurchaseDate(today()); setItems([]); setProgress(0); setError(""); setStatus("Choose a clear, flat receipt image.");
  }

  async function processReceipt(file?: File) {
    if (!file) return;
    setError("");
    if (!acceptedTypes.includes(file.type)) { setError("Use a PDF, JPG, PNG, or WebP receipt."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Receipt files must be 10 MB or smaller."); return; }
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setProcessing(true); setProgress(0.04); setFileName(file.name || "Camera receipt"); setStatus("Preparing receipt…");
    try {
      const image = await imageSource(file);
      setPreview(image.preview); setStatus("Reading merchant, date, and line items…");
      const { recognize } = await import("tesseract.js");
      const result = await recognize(image.source, "eng", { logger: (message) => {
        if (message.status === "recognizing text") setProgress(Math.max(0.12, message.progress));
        setStatus(message.status === "recognizing text" ? `Reading receipt… ${Math.round(message.progress * 100)}%` : "Preparing text reader…");
      } });
      const parsed = parseReceiptText(result.data.text);
      setMerchant(parsed.merchant);
      setPurchaseDate(parsed.purchaseDate || today());
      setItems(parsed.items.length ? parsed.items : [{ id: "receipt-1", productName: "", brand: "Not specified", category: "Uncategorized", price: "", selected: true }]);
      setProgress(1);
      setStatus(parsed.items.length ? `${parsed.items.length} likely item${parsed.items.length === 1 ? "" : "s"} found. Review before saving.` : "No line items were confidently detected. Add or edit the item below.");
    } catch (cause) {
      console.error(cause);
      setError("This receipt could not be read. Try a brighter, straighter image or another file.");
      setStatus("Receipt processing stopped.");
    } finally { setProcessing(false); }
  }

  function updateItem(id: string, patch: Partial<ReceiptLineItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addItem() {
    setItems((current) => [...current, { id: `receipt-${crypto.randomUUID()}`, productName: "", brand: "Not specified", category: "Uncategorized", price: "", selected: true }]);
  }

  return <section className="receipt-card">
    <div className="receipt-intro"><span className="receipt-icon"><ReceiptText size={24} /></span><div><p className="eyebrow">Fast receipt capture</p><h2>Scan a receipt</h2><p>Upload a file or use your phone camera. SafeKeep reads it on this device, then lets you confirm every item before saving.</p></div><span className="local-badge">Image stays local</span></div>
    {!fileName && <div className="receipt-capture" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void processReceipt(event.dataTransfer.files[0]); }}>
      <ScanLine size={34} /><strong>Drop a receipt here</strong><span>PDF, JPG, PNG, or WebP · up to 10 MB</span>
      <div className="receipt-actions"><button className="button button-primary" type="button" onClick={() => uploadRef.current?.click()}><Upload size={16} />Upload receipt</button><button className="button button-secondary" type="button" onClick={() => cameraRef.current?.click()}><Camera size={16} />Scan with camera</button></div>
      <input ref={uploadRef} className="visually-hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void processReceipt(event.target.files?.[0])} />
      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void processReceipt(event.target.files?.[0])} />
    </div>}
    {fileName && <div className="receipt-workspace">
      <aside className="receipt-preview"><div className="receipt-file"><FileImage size={15} /><span>{fileName}</span><button type="button" onClick={reset} aria-label="Choose another receipt"><RotateCcw size={14} /></button></div>{preview ? <Image src={preview} alt="Receipt selected for review" width={1200} height={1600} unoptimized /> : <div className="receipt-preview-loading"><LoaderCircle className="spin" /></div>}</aside>
      <div className="receipt-review">
        <div className="scan-status" aria-live="polite"><div><span style={{ width: `${Math.max(4, progress * 100)}%` }} /></div><p>{status}</p></div>
        {error && <div className="inline-error">{error}</div>}
        {!processing && items.length > 0 && <form action={importReceiptPurchases} className="receipt-form">
          <input type="hidden" name="receiptPayload" value={payload} />
          <div className="receipt-fields"><label>Retailer *<input value={merchant} onChange={(event) => setMerchant(event.target.value)} required placeholder="Store name" /></label><label>Purchase date *<input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></label></div>
          <div className="receipt-items-heading"><div><strong>Detected purchases</strong><span>Uncheck totals, discounts, or anything that isn’t a product.</span></div><button type="button" onClick={addItem}><Plus size={14} />Add item</button></div>
          <div className="receipt-items">{items.map((item, index) => <div className={`receipt-item${item.selected ? "" : " deselected"}`} key={item.id}>
            <label className="receipt-check"><input type="checkbox" checked={item.selected} onChange={(event) => updateItem(item.id, { selected: event.target.checked })} /><span>{index + 1}</span></label>
            <label>Product<input value={item.productName} onChange={(event) => updateItem(item.id, { productName: event.target.value })} required={item.selected} placeholder="Product name" /></label>
            <label>Brand<input value={item.brand} onChange={(event) => updateItem(item.id, { brand: event.target.value })} required={item.selected} /></label>
            <label>Category<input value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })} required={item.selected} /></label>
            <span className="receipt-price">{item.price ? `$${item.price}` : "—"}</span>
            <button className="receipt-remove" type="button" aria-label={`Remove ${item.productName || "item"}`} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}><Trash2 size={15} /></button>
          </div>)}</div>
          <div className="receipt-submit"><p>SafeKeep will compare the selected items with synchronized safety notices.</p><SaveButton count={selectedItems.length} /></div>
        </form>}
      </div>
    </div>}
  </section>;
}
