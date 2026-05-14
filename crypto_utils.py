import os
import time
import json
from Crypto.Cipher import AES, DES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes

def generate_key(algorithm):
    """Generates a key for the specified algorithm."""
    if algorithm.upper() == 'AES':
        return get_random_bytes(16)  # AES-128
    elif algorithm.upper() == 'DES':
        return get_random_bytes(8)   # DES (56-bit key represented in 8 bytes)
    else:
        raise ValueError("Unsupported algorithm")

def encrypt_data(data, key, algorithm):
    """Encrypts data using the specified algorithm and returns (ciphertext, iv, execution_time)."""
    start_time = time.time()
    
    if algorithm.upper() == 'AES':
        cipher = AES.new(key, AES.MODE_CBC)
        block_size = AES.block_size
    elif algorithm.upper() == 'DES':
        cipher = DES.new(key, DES.MODE_CBC)
        block_size = DES.block_size
    else:
        raise ValueError("Unsupported algorithm")
    
    iv = cipher.iv
    ciphertext = cipher.encrypt(pad(data, block_size))
    
    execution_time = time.time() - start_time
    return ciphertext, iv, execution_time

def decrypt_data(ciphertext, key, iv, algorithm):
    """Decrypts data using the specified algorithm and returns (decrypted_data, execution_time)."""
    start_time = time.time()
    
    if algorithm.upper() == 'AES':
        cipher = AES.new(key, AES.MODE_CBC, iv=iv)
        block_size = AES.block_size
    elif algorithm.upper() == 'DES':
        cipher = DES.new(key, DES.MODE_CBC, iv=iv)
        block_size = DES.block_size
    else:
        raise ValueError("Unsupported algorithm")
    
    decrypted_data = unpad(cipher.decrypt(ciphertext), block_size)
    
    execution_time = time.time() - start_time
    return decrypted_data, execution_time

def save_metadata(path, metadata):
    """Saves key and IV to a metadata file (for educational purposes)."""
    with open(path, 'w') as f:
        # Convert bytes to hex for JSON storage
        hex_metadata = {k: v.hex() if isinstance(v, bytes) else v for k, v in metadata.items()}
        json.dump(hex_metadata, f, indent=4)

def load_metadata(path):
    """Loads key and IV from a metadata file."""
    with open(path, 'r') as f:
        hex_metadata = json.load(f)
        # Convert hex back to bytes
        metadata = {k: bytes.fromhex(v) if k in ['key', 'iv'] else v for k, v in hex_metadata.items()}
        return metadata

def verify_files(original_data, decrypted_data):
    """Verifies if the original data matches the decrypted data."""
    return original_data == decrypted_data
