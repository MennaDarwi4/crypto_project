# CryptoLab — AES-128-CBC vs DES-56-CBC

> **Embedded Security · Cryptography Lib Lab — Path 2: Algorithm Comparison**  
> MennatAllah Essam Mohamed · Section 2 · 14 May 2026

---

## Overview

CryptoLab is a Flask web application that encrypts chat messages using **AES-128-CBC** and **DES-56-CBC** simultaneously, allowing side-by-side comparison of both ciphers on identical plaintext. The app measures encryption/decryption timing, ciphertext sizes, and verifies bit-exact round-trip recovery for both algorithms.

---

## Features

- Encrypt any JSON chat payload with both AES-128 and DES-56 in CBC mode
- Display ciphertext in **Hex**, **Base64**, and **Binary** formats
- Side-by-side key, IV, and size comparison
- Live performance benchmarks (encryption/decryption timing)
- Automatic round-trip verification (`verified: true/false`)
- Download output artifacts (`.bin`, `.hex.txt`, `.b64.txt`)
- Security rating comparison (AES: A+ vs DES: F)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · Flask · PyCryptodome |
| Frontend | HTML / CSS / JavaScript |
| Cryptography | `Crypto.Cipher.AES`, `Crypto.Cipher.DES`, `Crypto.Util.Padding` |
| Padding | PKCS#7 |
| Mode | CBC (Cipher Block Chaining) |

---

## Algorithm Comparison

| Property | AES-128-CBC | DES-56-CBC |
|----------|------------|-----------|
| Key Size | 128 bits (16 bytes) | 56 bits effective (8 bytes) |
| Block Size | 128 bits (16 bytes) | 64 bits (8 bytes) |
| Key Space | 2¹²⁸ combinations | 2⁵⁶ combinations |
| Status | ✅ NIST Standard — **SECURE** | ❌ Deprecated 2005 — **LEGACY** |
| Security Rating | **A+** | **F** |
| Brute-force | Resistant to all known attacks | Crackable in < 24 hours |
| Use in Production | TLS, SSH, VPN, file encryption | Educational purposes only |

---

## Project Structure

```
CryptoLab/
├── app.py                  # Flask server — /api/encrypt, /api/decrypt, /api/messages
├── crypto.py               # Core cryptography functions
├── data/
│   └── original_messages.json   # Default 5-message chat payload
├── output/                 # Generated artifacts (created at runtime)
│   ├── ciphertext_aes.bin
│   ├── ciphertext_aes.hex.txt
│   ├── ciphertext_aes.b64.txt
│   ├── ciphertext_des.bin
│   ├── ciphertext_des.hex.txt
│   ├── ciphertext_des.b64.txt
│   ├── decrypted_aes.json
│   └── decrypted_des.json
├── static/                 # CSS / JS
└── templates/              # HTML templates
```

---

## Core Functions (`crypto.py`)

### `generate_key(algorithm)`
Generates a fresh random key per request using `get_random_bytes`.
- AES → 16 bytes (128 bits)
- DES → 8 bytes (56 effective bits)

### `encrypt_data(data, key, algorithm)`
Encrypts a byte string using the specified algorithm in CBC mode.
- Applies **PKCS#7 padding** to align data to the block boundary
- Generates a random **IV** automatically on cipher instantiation
- Returns `(ciphertext, iv, execution_time_seconds)`

### `decrypt_data(ciphertext, key, iv, algorithm)`
Reverses encryption using the same key and IV.
- Calls `unpad` after decryption to strip PKCS#7 padding
- Returns `(plaintext_bytes, execution_time_seconds)`

### `save_metadata(path, metadata)` / `load_metadata(path)`
Converts binary key and IV to hex strings for JSON storage and back.
> ⚠️ For educational use only — never store keys alongside ciphertext in production.

### `verify_files(original_data, decrypted_data)`
Performs a byte-exact comparison between original and decrypted data.
Returns `True` if they match perfectly, `False` otherwise.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/messages` | Returns the default chat messages |
| `POST` | `/api/encrypt` | Encrypts messages with both AES and DES |
| `POST` | `/api/decrypt` | Decrypts ciphertext for a selected algorithm |

### POST `/api/encrypt` — Response Fields

```json
{
  "results": {
    "AES": {
      "ciphertext_hex": "...",
      "ciphertext_b64": "...",
      "key_hex": "...",
      "iv_hex": "...",
      "enc_time_ms": 0.21,
      "plaintext_size": 682,
      "ciphertext_size": 720,
      "verified": true
    },
    "DES": { "..." }
  }
}
```

---

## Encrypted Output (Sample Run)

| Metric | AES-128-CBC | DES-56-CBC |
|--------|------------|-----------|
| Plaintext size | 682 B | 682 B |
| Ciphertext size | 720 B | 712 B |
| Padding overhead | +38 B (16 B boundary) | +30 B (8 B boundary) |
| Encryption time | < 1 ms | < 1 ms |
| Verified | ✅ true | ✅ true |

---

## How to Run

**1. Install dependencies**
```bash
pip install flask pycryptodome
```

**2. Start the server**
```bash
python app.py
```

**3. Open in browser**
```
http://127.0.0.1:5000
```

**4. Use the app**
- Edit messages in the Message Editor (or load the 5 sample messages)
- Click **Encrypt & Compare** to run both ciphers
- Go to **Metrics** to see timing and size charts
- Go to **Decrypt** and select AES or DES to recover messages
- Check the **Outputs** tab or the `output/` folder for saved artifacts

---

## Security Limitations

> This project is for **educational purposes only**.

- Keys and IVs are returned in the API response in plaintext — never acceptable in production
- **DES** should never be used for any new confidential data
- **CBC mode** provides no authentication — ciphertext is malleable without HMAC or an AEAD scheme
- For production, use **AES-GCM** (authenticated encryption) instead of AES-CBC
- The `output/` directory may contain key material — do not commit it to public repositories

---

## What Was Learned

1. **Key length is the most critical security factor** — DES fails not because of a flawed design, but because 56 bits is too short for modern hardware
2. **CBC mode chaining** prevents identical plaintext blocks from producing identical ciphertext, but requires a random IV each run
3. **PKCS#7 padding** is necessary to handle arbitrary-length data with fixed block sizes
4. **Working correctly ≠ being secure** — both algorithms decrypt perfectly, but only AES is safe for real use
5. **Hardware acceleration** (AES-NI) means AES is actually *faster* than DES at scale, despite the larger key

---

## References

- [NIST FIPS 197 — AES Standard](https://csrc.nist.gov/publications/detail/fips/197/final)
- [NIST Withdrawal of DES (2005)](https://csrc.nist.gov/publications/detail/fips/46/3/final)
- [PyCryptodome Documentation](https://pycryptodome.readthedocs.io/)
- [CBC Mode — Wikipedia](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#CBC)

---

*CryptoLab · Helwan University · Faculty of Engineering · Embedded Security Course*
