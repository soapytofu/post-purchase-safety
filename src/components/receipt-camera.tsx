"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Upload, X } from "lucide-react";
import { cameraErrorMessage, stopCamera } from "@/lib/camera";

export function ReceiptCamera({ onCapture, onClose, onUpload }: { onCapture: (file: File) => void; onClose: () => void; onUpload: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let disposed = false;
    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera capture needs a supported browser and HTTPS (or localhost). You can still upload a receipt.");
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (disposed) { stopCamera(media); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; await video.current.play(); }
      } catch (cause) { if (!disposed) setError(cameraErrorMessage(cause)); }
    }
    void start();
    return () => { disposed = true; stopCamera(stream.current); stream.current = null; element?.close(); };
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function capture() {
    const element = video.current;
    if (!element?.videoWidth || !element.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth; canvas.height = element.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) { setError("This browser could not capture the image. Upload a receipt instead."); return; }
    context.drawImage(element, 0, 0);
    canvas.toBlob(blob => {
      if (!blob || !dialog.current?.open) return;
      const file = new File([blob], "camera-receipt.jpg", { type: "image/jpeg" });
      setSnapshot(file); setPreview(URL.createObjectURL(blob));
    }, "image/jpeg", 0.95);
  }

  return <dialog ref={dialog} className="camera-dialog" aria-labelledby="camera-title" onCancel={onClose}>
    <div className="camera-heading"><div><p className="eyebrow">Private capture</p><h2 id="camera-title">{snapshot ? "Check your photo" : "Scan with your camera"}</h2></div><button className="button button-secondary" type="button" onClick={onClose} aria-label="Close camera"><X size={20} /></button></div>
    <p>Keep the receipt flat and well lit, with every item visible. No video or image is sent to our server.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="camera-view">
      <video ref={video} autoPlay muted playsInline hidden={Boolean(snapshot) || Boolean(error)} onLoadedData={() => setReady(true)} aria-label="Live receipt camera preview" />
      {preview && <picture><img src={preview} alt="Captured receipt for review" /></picture>}
      {!ready && !error && <p role="status">Allow camera access in your browser to begin.</p>}
    </div>
    <div className="camera-controls">
      {snapshot ? <><button className="button button-secondary" type="button" onClick={() => { setSnapshot(null); setPreview(""); }}><RotateCcw size={16} />Retake</button><button className="button button-primary" type="button" onClick={() => onCapture(snapshot)}>Use this photo</button></> : <button className="button button-primary" type="button" disabled={!ready || Boolean(error)} onClick={capture}><Camera size={16} />Take photo</button>}
      <button className="button button-secondary" type="button" onClick={onUpload}><Upload size={16} />Upload instead</button>
    </div>
  </dialog>;
}
