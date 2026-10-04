// Anansi Haven private-house client helper. Zero deps: WebCrypto (Node 20+, browsers, Deno, Workers).
// The key is derived ON THE AGENT SIDE from a passphrase (PBKDF2-SHA256, 600k iterations) or imported from
// 32 raw bytes you already hold. The Haven never receives the key or plaintext, only ciphertext + iv + kdf params.
//
//   import { HavenHouse } from "./haven-house.mjs";
//   const house = await HavenHouse.fromPassphrase({ baseUrl: "http://127.0.0.1:8811", apiKey: "hv_...", agentId: "ag_...", passphrase: process.env.HOUSE_PASSPHRASE });
//   await house.put("journal", { thoughts: "only I can read this" });
//   const back = await house.get("journal");
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));   // works in Node 20+, browsers, Deno, Workers
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, "0")).join("");
const subtle = globalThis.crypto.subtle;

export class HavenHouse {
  constructor({ baseUrl, apiKey, agentId, key, nameKey, kdf, hashNames = true, fetchImpl = globalThis.fetch }) {
    Object.assign(this, { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, agentId, key, nameKey, kdf, hashNames, fetchImpl });
  }
  // salt: keep it stable per agent (store it in plain Haven memory or derive from agentId). It is not secret.
  static async fromPassphrase({ passphrase, salt, iterations = 600_000, ...opts }) {
    if (!passphrase || passphrase.length < 12) throw new Error("passphrase: at least 12 characters");
    const s = salt ? unb64(salt) : new Uint8Array(await subtle.digest("SHA-256", enc.encode(`anansi-haven-house:${opts.agentId}`))).slice(0, 16);
    const base = await subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", salt: s, iterations, hash: "SHA-256" }, base, 512));
    return HavenHouse.fromRawKey({ raw: bits.slice(0, 32), nameRaw: bits.slice(32), kdf: { name: "PBKDF2", salt: b64(s), iterations, hash: "SHA-256" }, ...opts });
  }
  static async fromRawKey({ raw, nameRaw, kdf = { name: "raw" }, ...opts }) {
    const key = await subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    const nameKey = await subtle.importKey("raw", nameRaw || raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new HavenHouse({ key, nameKey, kdf, ...opts });
  }
  async blobName(name) {
    if (!this.hashNames) return name;
    const mac = new Uint8Array(await subtle.sign("HMAC", this.nameKey, enc.encode(name)));
    return "h_" + hex(mac).slice(0, 40);
  }
  // AAD binds ciphertext to this agent + logical name, so blobs can't be swapped between names or agents.
  aad(name) { return enc.encode(`anansi-haven-house|${this.agentId}|${name}`); }
  async encrypt(name, value) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: this.aad(name) }, this.key, enc.encode(JSON.stringify(value))));
    return { ciphertext: b64(ct), iv: b64(iv), alg: "AES-GCM-256", kdf: this.kdf };
  }
  async decrypt(name, blob) {
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv), additionalData: this.aad(name) }, this.key, unb64(blob.ciphertext));
    return JSON.parse(dec.decode(pt));
  }
  async req(method, path, body) {
    const r = await this.fetchImpl(this.baseUrl + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.message || `HTTP ${r.status}`), { status: r.status, code: j.error }); return j;
  }
  async put(name, value) { return this.req("PUT", `/v1/house/blobs/${await this.blobName(name)}`, await this.encrypt(name, value)); }
  async get(name) { return this.decrypt(name, await this.req("GET", `/v1/house/blobs/${await this.blobName(name)}`)); }
  async delete(name) { return this.req("DELETE", `/v1/house/blobs/${await this.blobName(name)}`); }
  async info() { return this.req("GET", "/v1/house"); }
}
