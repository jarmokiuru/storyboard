// Offline copy (service worker), update check and storage promise.

export const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export async function storageKept() {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || (await navigator.storage.persist());
}

// onUpdate(worker) is called when a new version has downloaded; worker.postMessage("activate") switches to it.
export async function setupOffline(onUpdate) {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    if (reg.waiting && navigator.serviceWorker.controller) onUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) onUpdate(worker);
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && navigator.onLine) reg.update().catch(() => {});
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  } catch {
    // No offline copy in this browser; the app still works while online.
  }
}
