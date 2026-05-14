# CryptoLab — Technical Report

**Course / lab:** *[fill if required]*  
**Author:** *[your name]*  
**Date:** *[submission date]*  

---

## Table of contents

1. [Scenario and objectives](#1-scenario-and-objectives)  
2. [System overview](#2-system-overview)  
3. [Algorithms and implementation](#3-algorithms-and-implementation)  
4. [Keys, IV, padding, and plaintext format](#4-keys-iv-padding-and-plaintext-format)  
5. [Encrypted output](#5-encrypted-output)  
6. [Decrypted output](#6-decrypted-output)  
7. [Persistence: `data/` and `output/` folders](#7-persistence-data-and-output-folders)  
8. [Verification of correct decryption](#8-verification-of-correct-decryption)  
9. [API summary](#9-api-summary)  
10. [Results and observations](#10-results-and-observations)  
11. [Security limitations](#11-security-limitations)  
12. [Figures — screenshots](#12-figures--screenshots)  
13. [How to run the project](#13-how-to-run-the-project)  

---

## 1. Scenario and objectives

**Scenario:** **CryptoLab** is a small web application where users edit **chat-style messages** (sender, message text, timestamp). On **Encrypt & Compare**, the browser sends the message list as JSON to a **Flask** backend. The server serializes that list to **UTF-8 bytes**, encrypts the **same plaintext** with **AES-128-CBC** and **DES-CBC** in parallel (each with its own random key and IV), measures encrypt/decrypt times, and returns structured results to the UI.

**Objectives:**

- Compare **AES** (modern) vs **DES** (legacy) on the **identical plaintext**.  
- Show **ciphertext** (hex, Base64, binary), **keys**, and **IVs** for inspection and for optional user-driven decryption.  
- Demonstrate **PKCS#7 padding** through ciphertext length vs JSON length.  
- Prove **bit-exact recovery** after a full encrypt–decrypt round trip.  
- Persist **artifacts** under `output/` and optionally **custom input** under `data/` for reports and demos.  

---

## 2. System overview

| Layer | Technology | Role |
|--------|------------|------|
| **Frontend** | `static/index.html`, `static/style.css`, `static/script.js` | Message editor, encrypt/decrypt controls, charts, copy/download for ciphertext and decrypted JSON. |
| **Backend** | `app.py` (Flask), `crypto_utils.py` (PyCryptodome) | `/api/messages`, `/api/encrypt`, `/api/decrypt`; writes files to `output/`; syncs custom input to `data/user_input.json`. |
| **Sample data** | `data/original_messages.json` | Default messages returned by `GET /api/messages`. |
| **Custom input** | `data/user_input.json` | Created/updated only when encrypted payload **differs** from the sample (canonical JSON comparison). Removed when payload **matches** the sample again. |
| **Run artifacts** | `output/` | Ciphertext files, plaintext snapshot, decrypted JSON after decrypt. |

**High-level flow**

1. User loads or edits messages → `POST /api/encrypt` with `{ "messages": [ ... ] }`.  
2. Server optionally saves `data/user_input.json`, encrypts, verifies round-trip, writes `output/*`, returns JSON including `ciphertext_hex`, `ciphertext_b64`, keys, IVs, timings, `verified`, `output_saved`, and optional `data_input_saved` / `data_input_cleared`.  
3. User may call `POST /api/decrypt` with hex ciphertext + key + IV + algorithm → server returns messages and writes `output/decrypted_<algo>.json`.  

---

## 3. Algorithms and implementation

### 3.1 Which algorithms, and why?

| Algorithm | Configuration in code | Role |
|-----------|-------------------------|------|
| **AES-128** | 16-byte key, **CBC**, 16-byte blocks (`AES.block_size`) | **Primary choice** for confidentiality today: large key space, NIST-standardized, used widely in TLS and file encryption. |
| **DES** | 8-byte key (56-bit effective key), **CBC**, 8-byte blocks | **Educational contrast**: same mode family, much smaller key space; **deprecated** for new designs (brute-force feasible). |

**Why both?** The lab requires a **controlled comparison**: same plaintext, same mode (CBC), same padding scheme, different cipher and key size—so differences in **speed**, **ciphertext size**, and **security margin** are visible.

**Production note:** Prefer **AES-GCM** (or another **AEAD**) for authenticated encryption; CBC alone does not integrity-protect ciphertext (see [Section 11](#11-security-limitations)).

### 3.2 Library and mode

- **Library:** PyCryptodome (`Crypto.Cipher.AES`, `Crypto.Cipher.DES`).  
- **Mode:** `MODE_CBC` for both ciphers.  
- **Padding:** `Crypto.Util.Padding.pad` / `unpad` with the cipher’s block size → **PKCS#7**-style padding to a multiple of the block size.  

Implementation reference: `crypto_utils.py` (`encrypt_data`, `decrypt_data`, `generate_key`, `verify_files`).

---

## 4. Keys, IV, padding, and plaintext format

### 4.1 What is the key used for?

For **each** encryption request and **each** algorithm, the server calls `get_random_bytes` to build a **new random key**:

- **AES:** 16 bytes → **AES-128**.  
- **DES:** 8 bytes → DES key material (56 effective bits).  

The key defines **which permutation** of block values the cipher applies under CBC chaining. The **same key** is required to decrypt. Keys are exposed in the API/UI as **hex** for the lab; in production, keys must be **distributed and stored** using a proper key-management design, not returned alongside ciphertext in clear JSON.

### 4.2 What is the role of the IV?

**CBC** uses an **initialization vector (IV)**, not a nonce in the AEAD sense. In this project:

- The IV is **created by the library** when instantiating `AES.new(key, AES.MODE_CBC)` / `DES.new(key, DES.MODE_CBC)` and read from `cipher.iv`.  
- It is **random per encryption** for each algorithm run.  
- It **must be the same** when decrypting; it is usually **public** alongside ciphertext but must be **unpredictable** for a given key/message pattern to avoid certain attacks.  

The server returns `iv_hex` per algorithm; decryption reconstructs the cipher with `AES.new(..., iv=iv)` / `DES.new(..., iv=iv)`.

### 4.3 Plaintext format

The plaintext byte string is:

```text
json.dumps(messages, ensure_ascii=False).encode('utf-8')
```

So the “message” to the cipher is **one JSON document** representing the whole chat array, not one HTTP field per line.

---

## 5. Encrypted output

### 5.1 Compared to the original data

| Aspect | Original (plaintext) | Encrypted output |
|--------|----------------------|------------------|
| **Format** | UTF-8 JSON text (readable) | Binary ciphertext (opaque) |
| **API** | N/A | `ciphertext_hex` (full), `ciphertext_b64` (Base64), `ciphertext_preview` (first 64 hex chars + `...`) |
| **Length** | `plaintext_size_bytes` | `ciphertext_size_bytes` ≥ plaintext length padded to block boundary |

Hex encoding makes the stored/transmitted form roughly **twice** the byte length of raw ciphertext; Base64 is about **4/3** of the raw byte length in characters.

### 5.2 Where encrypted output appears

1. **Browser:** After encrypt, each result card shows preview, full **hex** and **Base64** text areas, and buttons to **copy** or **download** `.hex`, `.b64`, and **raw `.bin`**.  
2. **Server disk (`output/`):** Each successful encrypt writes:  
   - `ciphertext_aes.bin`, `ciphertext_aes.hex.txt`, `ciphertext_aes.b64.txt`  
   - `ciphertext_des.bin`, `ciphertext_des.hex.txt`, `ciphertext_des.b64.txt`  
   - `plaintext.json` — JSON snapshot of the messages that were encrypted (same run).  

The JSON response lists relative paths in `output_saved`.

---

## 6. Decrypted output

### 6.1 In the application

After **Decrypt Selected**, the UI shows:

- Recovered messages in cards (sender, text, timestamp).  
- A **Decrypted output** panel: pretty-printed **JSON** of the recovered array, with **Copy JSON** and **Download** (`decrypted_aes.json` / `decrypted_des.json` in the browser).  

### 6.2 On disk

Each successful **`POST /api/decrypt`** writes:

- `output/decrypted_aes.json` or `output/decrypted_des.json` (overwritten per algorithm on each decrypt call).  

The API returns `messages`, `dec_time_ms`, `algorithm`, and `output_saved`.

---

## 7. Persistence: `data/` and `output/` folders

### 7.1 `data/`

| File | Purpose |
|------|---------|
| `original_messages.json` | **Bundled sample** messages; served by `GET /api/messages`. |
| `user_input.json` | **Optional.** Written when the encrypted payload is **not** equal to the sample (equality after **canonical JSON** comparison with `sort_keys=True` so field order does not matter). **Deleted** when the user encrypts payload that **matches** the sample again. |

The encrypt response may include:

- `data_input_saved`: `"data/user_input.json"` when custom input was saved.  
- `data_input_cleared` / `data_input_path` when the file was removed because input matched the sample.  

### 7.2 `output/`

All items below are **regenerated** on the corresponding API call (last run wins).

| File(s) | When written |
|---------|----------------|
| `plaintext.json` | Every successful encrypt |
| `ciphertext_aes.*`, `ciphertext_des.*` | Every successful encrypt (`.bin`, `.hex.txt`, `.b64.txt`) |
| `decrypted_aes.json` / `decrypted_des.json` | Successful decrypt for that algorithm |

---

## 8. Verification of correct decryption

**Server-side (automatic on every encrypt):**  
After encrypting, the server decrypts with the same key and IV and compares:

```python
verify_files(plaintext, decrypted_data)  # byte equality: original_data == decrypted_data
```

The boolean is returned per algorithm as **`verified`** in `results.AES` / `results.DES`.

**User-side (UI):**  
The user can run **Decrypt Selected** for AES or DES; recovery is shown as structured messages and as JSON. Consistency with the server’s internal check depends on using the **same** `ciphertext_hex`, `key_hex`, `iv_hex`, and `algorithm` returned for that run.

---

## 9. API summary

| Method | Path | Body / behavior | Main response fields |
|--------|------|-------------------|----------------------|
| `GET` | `/api/messages` | — | `messages` from `data/original_messages.json` |
| `POST` | `/api/encrypt` | `{ "messages": [ ... ] }` | `results.{AES,DES}`: `ciphertext_hex`, `ciphertext_b64`, `key_hex`, `iv_hex`, timings, sizes, `verified`; `output_saved`; optional `data_input_saved` / `data_input_cleared` |
| `POST` | `/api/decrypt` | `ciphertext_hex`, `key_hex`, `iv_hex`, `algorithm` | `messages`, `dec_time_ms`, `output_saved` |

---

## 10. Results and observations

*[Fill this section with your own measurements and screenshots. Suggested content:]*

- **Timing:** Record `enc_time_ms` and `dec_time_ms` for AES vs DES from one run; note which was faster and whether differences are stable across runs.  
- **Size:** Compare `plaintext_size_bytes` to `ciphertext_size_bytes` for each algorithm; relate to block size (16 vs 8) and padding.  
- **Verified flags:** Confirm both algorithms show `verified: true` after encrypt.  
- **Visual:** Paste ciphertext preview vs full hex/Base64 in the appendix or refer to figures below.  

**Your summary (one short paragraph):**  

*[Add your measured numbers and interpretation here.]*  

---

## 11. Security limitations

Choose the limitations most relevant to your course discussion; all apply to this demo.

1. **Key and IV in the API response** — Anyone who can read HTTP responses can decrypt. The design favors **learning**, not **confidentiality against eavesdroppers**. Use **HTTPS** and never expose long-term keys this way in production.  
2. **DES key size** — Practical brute-force attacks exist against 56-bit keys; DES must not be used for new confidential data.  
3. **CBC without authentication** — Without HMAC or an AEAD mode, ciphertext can be **malleable** (bit-flipping); integrity is not guaranteed.  
4. **Disk artifacts** — `output/` and `data/user_input.json` may contain **sensitive message content** and key material on the server host; protect the machine and do not commit secrets to public repositories.  

---


## Appendix A — Project file map (reference)

```text
project root/
  app.py                 # Flask routes, file persistence
  crypto_utils.py        # AES/DES CBC, padding, verify
  data/
    original_messages.json
    user_input.json      # only when input ≠ sample
  output/                # generated ciphertext, plaintext, decrypted JSON
  static/
    index.html
    style.css
    script.js
  docs/
    REPORT.md            # this document
```

---

*End of report.*
