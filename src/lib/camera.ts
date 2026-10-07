export function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow camera access in your browser settings, or upload a receipt instead.";
  if (name === "NotFoundError") return "No camera was found on this device. You can upload a receipt instead.";
  if (name === "NotReadableError") return "The camera is busy or unavailable. Close other apps using it, then try again.";
  return "The camera could not start. Try another browser or upload a receipt instead.";
}

export function stopCamera(stream: { getTracks: () => { stop: () => void }[] } | null) {
  stream?.getTracks().forEach(track => track.stop());
}
