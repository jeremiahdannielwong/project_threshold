/**
 * Operator audit log — localStorage-backed for now, designed to swap to a
 * server-side store when the platform goes multi-tenant.
 *
 * Every consequential operator action writes a structured entry. A regulator
 * or a council member asking "why was this decision made on this day at this
 * hour" should be able to read the audit log and reconstruct the chain.
 */

import type { Lens } from './context';

export type AuditActionKind =
  | 'tract.select'
  | 'tract.annotate'
  | 'lens.change'
  | 'scenario.change'
  | 'restoration.sequence'
  | 'restoration.mark-restored'
  | 'intervention.flag'
  | 'export.brief'
  | 'export.roster';

export interface AuditEntry {
  id: string;
  ts: number;            // epoch ms
  lens: Lens;
  action: AuditActionKind;
  /** Human label of the target, e.g. "Heart Lake West" or "LEAP outreach roster". */
  targetLabel: string;
  /** Optional ctuid the action attaches to. */
  ctuid?: string;
  /** Optional free-text note. */
  note?: string;
  /**
   * SHA-256 hash of (this entry's content + previous entry's hash).
   * Tamper-evident chain. Anchoring to an external timestamping service
   * is the next step toward regulatory-grade attestation; the chain
   * structure here is the substrate for that.
   */
  hash?: string;
  /** Hash of the previous entry — empty string for the genesis entry. */
  prevHash?: string;
}

async function sha256(text: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function chainEntry(e: AuditEntry, prevHash: string): Promise<AuditEntry> {
  const payload = JSON.stringify({
    id: e.id, ts: e.ts, lens: e.lens, action: e.action,
    targetLabel: e.targetLabel, ctuid: e.ctuid, note: e.note, prevHash,
  });
  const hash = await sha256(payload);
  return { ...e, prevHash, hash };
}

const KEY = 'threshold.audit.v1';
const MAX_ENTRIES = 500;

function read(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function write(entries: AuditEntry[]): void {
  try {
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* quota or privacy mode — silently fail */
  }
}

export function listAudit(): AuditEntry[] {
  return read().sort((a, b) => b.ts - a.ts);
}

export function appendAudit(entry: Omit<AuditEntry, 'id' | 'ts' | 'hash' | 'prevHash'> & { ts?: number }): AuditEntry {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const ts = entry.ts ?? Date.now();
  const full: AuditEntry = { ...entry, id, ts };
  // Hash the entry asynchronously. We commit the unhashed entry immediately
  // (so the UI is responsive), then patch it with the chained hash. Listeners
  // are notified twice — once on append, once on hash-settle — which is fine
  // because the UI only renders display fields, not the hash.
  const all = read();
  const prev = all[all.length - 1];
  const prevHash = prev?.hash ?? '';
  all.push(full);
  write(all);
  window.dispatchEvent(new CustomEvent('threshold:audit', { detail: full }));

  chainEntry(full, prevHash).then(hashed => {
    const current = read();
    const idx = current.findIndex(e => e.id === id);
    if (idx >= 0) {
      current[idx] = hashed;
      write(current);
      window.dispatchEvent(new CustomEvent('threshold:audit', { detail: hashed }));
    }
  });

  return full;
}

/**
 * Verify the audit log's hash chain. Returns the index of the first
 * tampered entry, or -1 if the chain is intact (or empty / unhashed).
 */
export async function verifyAuditChain(): Promise<number> {
  const all = read();
  let prevHash = '';
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (!e.hash) continue; // still pending
    const expected = await chainEntry(e, prevHash);
    if (expected.hash !== e.hash) return i;
    prevHash = e.hash;
  }
  return -1;
}

export function clearAudit(): void {
  write([]);
  window.dispatchEvent(new CustomEvent('threshold:audit', { detail: null }));
}

/* ─── Annotations — operator notes attached to a tract ─── */

const ANN_KEY = 'threshold.annotations.v1';

export interface Annotation {
  ctuid: string;
  note: string;
  lens: Lens;
  ts: number;
}

export function readAnnotations(): Record<string, Annotation> {
  try {
    const raw = localStorage.getItem(ANN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return {};
    return parsed as Record<string, Annotation>;
  } catch {
    return {};
  }
}

export function writeAnnotation(a: Annotation): void {
  const all = readAnnotations();
  all[a.ctuid] = a;
  try { localStorage.setItem(ANN_KEY, JSON.stringify(all)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('threshold:annotation', { detail: a }));
}

export function deleteAnnotation(ctuid: string): void {
  const all = readAnnotations();
  delete all[ctuid];
  try { localStorage.setItem(ANN_KEY, JSON.stringify(all)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('threshold:annotation', { detail: { ctuid, deleted: true } }));
}

/* ─── Restoration sequencing state ─── */

const RESTORE_KEY = 'threshold.restoration.v1';

export interface RestorationState {
  /** ctuid → {sequence, status, ts} */
  [ctuid: string]: {
    sequence: number;
    status: 'queued' | 'in-progress' | 'restored';
    ts: number;
  };
}

export function readRestoration(): RestorationState {
  try {
    const raw = localStorage.getItem(RESTORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RestorationState;
  } catch {
    return {};
  }
}

export function writeRestoration(state: RestorationState): void {
  try { localStorage.setItem(RESTORE_KEY, JSON.stringify(state)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('threshold:restoration', { detail: state }));
}
