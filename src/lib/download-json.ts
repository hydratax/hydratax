/** Browser-only: save a JSON string as a file. The filename is server-generated. */
export function downloadJson(filename: string, json: string): void {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
