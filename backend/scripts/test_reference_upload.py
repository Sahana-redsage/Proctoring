import requests

SESSION_ID = "98744444-4444-4444-4444-444444444444"
API_URL = f"http://localhost:8000/sessions/{SESSION_ID}/reference-photo"

IMAGE_PATH = "reference_pic.jpg"

def main():
    with open(IMAGE_PATH, "rb") as f:
        files = {"file": f}
        response = requests.post(API_URL, files=files)

    print("STATUS:", response.status_code)
    print("RESPONSE:", response.text)

if __name__ == "__main__":
    main()
