import os
import requests
import cv2
import numpy as np
from deepface import DeepFace

# Cache for downloaded reference images (URL -> NumPy Array)
_reference_cache = {}

def verify_identity(frame, reference_image_url):
    """
    Returns:
    - True  → same person
    - False → confirmed mismatch
    - None  → inconclusive (DO NOT treat as mismatch)
    """
    if not reference_image_url:
        return True

    # Check if reference image is already cached in memory
    if reference_image_url not in _reference_cache:
        try:
            response = requests.get(reference_image_url, timeout=10)
            response.raise_for_status()
            
            # Convert bytes to numpy array
            image_array = np.frombuffer(response.content, np.uint8)
            ref_img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            
            if ref_img is not None:
                _reference_cache[reference_image_url] = ref_img
            else:
                return None
        except Exception as e:
            print(f"⚠️  Failed to download reference image: {e}")
            return None
    
    ref_img = _reference_cache[reference_image_url]

    try:
        # Pass numpy arrays directly to DeepFace
        result = DeepFace.verify(
            img1_path=frame,
            img2_path=ref_img,
            enforce_detection=False,
            detector_backend="opencv",
            model_name="Facenet512"
        )

        return result.get("verified", False)

    except Exception as e:
        # Log the error for debugging
        print(f"⚠️  Identity verification failed: {type(e).__name__}: {str(e)}")
        # inconclusive ≠ mismatch
        return None