/* database.js — penyimpanan lokal IndexedDB (fallback ke memori jika IndexedDB tidak tersedia). */
(function (G) {
'use strict';
const C = G.CAI;
const STORES = { matches: 'id', analysis: 'matchId', versions: 'id', meta: 'key' };
const DB = {
  name: 'chess-ai-db', db: null, persistent: false, mem: {},
  async open() {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no idb');
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(this.name, 1);
        r.onupgradeneeded = () => { for (const [n, k] of Object.entries(STORES)) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      });
      this.persistent = true;
    } catch (e) { this.db = null; this.persistent = false; for (const n of Object.keys(STORES)) this.mem[n] = this.mem[n] || new Map(); }
    return this.persistent;
  },
  _req(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode), rq = fn(tx.objectStore(store));
      tx.oncomplete = () => res(rq ? rq.result : undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  async put(store, val) { if (!this.db) { this.mem[store].set(val[STORES[store]], structuredClone(val)); return; } return this._req(store, 'readwrite', s => s.put(val)); },
  async get(store, key) { if (!this.db) { const v = this.mem[store].get(key); return v === undefined ? undefined : structuredClone(v); } return this._req(store, 'readonly', s => s.get(key)); },
  async getAll(store) { if (!this.db) return [...this.mem[store].values()].map(v => structuredClone(v)); return this._req(store, 'readonly', s => s.getAll()); },
  async del(store, key) { if (!this.db) { this.mem[store].delete(key); return; } return this._req(store, 'readwrite', s => s.delete(key)); },
  async count(store) { if (!this.db) return this.mem[store].size; return this._req(store, 'readonly', s => s.count()); }
};
C.DB = DB;
})(globalThis);
