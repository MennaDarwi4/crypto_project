import os
import json
import time
import base64
from flask import Flask, request, jsonify, send_from_directory
import sys
sys.path.insert(0, os.path.dirname(__file__))
import crypto_utils

app = Flask(__name__, static_folder='static', static_url_path='')

DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'original_messages.json')
USER_INPUT_PATH = os.path.join(os.path.dirname(__file__), 'data', 'user_input.json')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')


def _ensure_output_dir():
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def _write_ciphertext_files(algo, ciphertext, ciphertext_hex, ciphertext_b64):
    """Write hex, Base64, and binary ciphertext under output/."""
    _ensure_output_dir()
    tag = algo.lower()
    base = os.path.join(OUTPUT_DIR, f'ciphertext_{tag}')
    with open(base + '.bin', 'wb') as f:
        f.write(ciphertext)
    with open(base + '.hex.txt', 'w', encoding='utf-8') as f:
        f.write(ciphertext_hex + '\n')
    with open(base + '.b64.txt', 'w', encoding='utf-8') as f:
        f.write(ciphertext_b64 + '\n')


def _relative_output_paths(names):
    return ['output/' + n for n in names]


def _sync_custom_input_file(messages):
    """
    If messages match data/original_messages.json, remove data/user_input.json if present.
    Otherwise save the current payload to data/user_input.json.
    Returns a dict for the API: { 'saved': path } | { 'cleared': True } | {}
    """
    try:
        with open(DATA_PATH, 'r', encoding='utf-8') as f:
            sample = json.load(f)
    except (OSError, json.JSONDecodeError):
        sample = None

    def _canon(obj):
        return json.dumps(obj, sort_keys=True, ensure_ascii=False)

    if sample is not None and _canon(messages) == _canon(sample):
        if os.path.isfile(USER_INPUT_PATH):
            os.remove(USER_INPUT_PATH)
            return {'cleared': True, 'path': 'data/user_input.json'}
        return {}

    os.makedirs(os.path.dirname(USER_INPUT_PATH), exist_ok=True)
    with open(USER_INPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(messages, f, indent=2, ensure_ascii=False)
    return {'saved': True, 'path': 'data/user_input.json'}

# ─── Routes ────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/messages', methods=['GET'])
def get_messages():
    """Return sample chat messages."""
    try:
        with open(DATA_PATH, 'r') as f:
            messages = json.load(f)
        return jsonify({'success': True, 'messages': messages})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/encrypt', methods=['POST'])
def encrypt():
    """
    Encrypt messages with both AES and DES.
    Body: { "messages": [...] }
    Returns: AES + DES results with ciphertext hex, keys, IVs, timings.
    """
    try:
        body = request.get_json(force=True)
        messages = body.get('messages', [])
        if not messages:
            return jsonify({'success': False, 'error': 'No messages provided'}), 400

        data_input_status = _sync_custom_input_file(messages)

        # Serialize messages to bytes
        plaintext = json.dumps(messages, ensure_ascii=False).encode('utf-8')
        plaintext_size = len(plaintext)

        results = {}
        saved_names = []
        for algo in ['AES', 'DES']:
            key = crypto_utils.generate_key(algo)
            ciphertext, iv, enc_time = crypto_utils.encrypt_data(plaintext, key, algo)

            # Also time decryption
            dec_data, dec_time = crypto_utils.decrypt_data(ciphertext, key, iv, algo)
            verified = crypto_utils.verify_files(plaintext, dec_data)

            ciphertext_hex = ciphertext.hex()
            ciphertext_b64 = base64.b64encode(ciphertext).decode('ascii')
            _write_ciphertext_files(algo, ciphertext, ciphertext_hex, ciphertext_b64)
            tag = algo.lower()
            saved_names.extend([
                f'ciphertext_{tag}.bin',
                f'ciphertext_{tag}.hex.txt',
                f'ciphertext_{tag}.b64.txt',
            ])

            results[algo] = {
                'ciphertext_hex': ciphertext_hex,
                'ciphertext_b64': ciphertext_b64,
                'ciphertext_preview': ciphertext_hex[:64] + '...',
                'key_hex': key.hex(),
                'iv_hex': iv.hex(),
                'key_size_bits': len(key) * 8,
                'block_size_bytes': 16 if algo == 'AES' else 8,
                'ciphertext_size_bytes': len(ciphertext),
                'plaintext_size_bytes': plaintext_size,
                'enc_time_ms': round(enc_time * 1000, 4),
                'dec_time_ms': round(dec_time * 1000, 4),
                'verified': verified,
            }

        _ensure_output_dir()
        plaintext_path = os.path.join(OUTPUT_DIR, 'plaintext.json')
        with open(plaintext_path, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)
        saved_names.append('plaintext.json')

        payload = {
            'success': True,
            'plaintext_size_bytes': plaintext_size,
            'results': results,
            'output_saved': _relative_output_paths(saved_names),
        }
        if data_input_status.get('saved'):
            payload['data_input_saved'] = data_input_status['path']
        elif data_input_status.get('cleared'):
            payload['data_input_cleared'] = True
            payload['data_input_path'] = data_input_status['path']
        return jsonify(payload)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/decrypt', methods=['POST'])
def decrypt():
    """
    Decrypt a ciphertext.
    Body: { "ciphertext_hex": "...", "key_hex": "...", "iv_hex": "...", "algorithm": "AES"|"DES" }
    Returns: decrypted messages array.
    """
    try:
        body = request.get_json(force=True)
        ciphertext = bytes.fromhex(body['ciphertext_hex'])
        key = bytes.fromhex(body['key_hex'])
        iv = bytes.fromhex(body['iv_hex'])
        algo = body.get('algorithm', 'AES').upper()

        dec_data, dec_time = crypto_utils.decrypt_data(ciphertext, key, iv, algo)
        messages = json.loads(dec_data.decode('utf-8'))

        _ensure_output_dir()
        dec_name = f'decrypted_{algo.lower()}.json'
        dec_path = os.path.join(OUTPUT_DIR, dec_name)
        with open(dec_path, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)

        return jsonify({
            'success': True,
            'algorithm': algo,
            'messages': messages,
            'dec_time_ms': round(dec_time * 1000, 4),
            'output_saved': _relative_output_paths([dec_name]),
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
