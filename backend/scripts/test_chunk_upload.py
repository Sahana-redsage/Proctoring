import requests
import sys

SESSION_ID = "98744444-4444-4444-4444-444444444444"
CHUNK_INDEX = 0

API_URL = f"http://localhost:8000/chunks/{SESSION_ID}/{CHUNK_INDEX}"
VIDEO_PATH = "test_chunk_0.webm"

def main():
    with open(VIDEO_PATH, "rb") as f:
        files = {"file": f}
        resp = requests.post(API_URL, files=files)

    print("STATUS:", resp.status_code)
    print("RESPONSE:", resp.text)

if __name__ == "__main__":
    main()
