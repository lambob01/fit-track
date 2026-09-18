import bcrypt


def hash_password(password: str) -> str:
    encoded = password.encode()
    if len(encoded) > 72:
        raise ValueError("password must be at most 72 bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False
