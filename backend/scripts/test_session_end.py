import requests
import sys

# Change this to the session ID you want to end
SESSION_ID = "98744444-4444-4444-4444-444444444444"
LAST_CHUNK_INDEX = 0 # Adjust this to the last chunk index uploaded

API_URL = f"http://localhost:8000/sessions/{SESSION_ID}/end"

def main():
    # last_chunk_index is passed as a query parameter
    params = {"last_chunk_index": LAST_CHUNK_INDEX}
    
    print(f"Ending session: {SESSION_ID} with last_chunk_index: {LAST_CHUNK_INDEX}")
    resp = requests.post(API_URL, params=params)

    print("STATUS:", resp.status_code)
    try:
        print("RESPONSE:", resp.json())
    except:
        print("RESPONSE:", resp.text)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        SESSION_ID = sys.argv[1]
    if len(sys.argv) > 2:
        LAST_CHUNK_INDEX = int(sys.argv[2])
        
    main()
