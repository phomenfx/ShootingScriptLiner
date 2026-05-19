import { getProjectCacheKey } from "./annotationUtils";
import type { Project } from "../types/project";

const DB_NAME = "shooting-script-liner-pdf";
const STORE = "pdfs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function savePdfToCache(key: string, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ buffer, name: file.name, type: file.type }, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPdfFromCache(key: string): Promise<File | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      db.close();
      const row = req.result as { buffer: ArrayBuffer; name: string; type: string } | undefined;
      if (!row?.buffer) {
        resolve(null);
        return;
      }
      resolve(new File([row.buffer], row.name, { type: row.type || "application/pdf" }));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function cachePdfForProject(project: Project, file: File): Promise<void> {
  await savePdfToCache(getProjectCacheKey(project), file);
}

export async function loadPdfForProject(project: Project): Promise<File | null> {
  return loadPdfFromCache(getProjectCacheKey(project));
}
