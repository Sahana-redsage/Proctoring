import os
import requests
from tqdm import tqdm

def download_file(url, dest_folder):
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
    
    filename = url.split('/')[-1]
    file_path = os.path.join(dest_folder, filename)
    
    if os.path.exists(file_path):
        print(f"✅ {filename} already exists in {dest_folder}")
        return file_path

    print(f"📥 Downloading {filename}...")
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))
    
    with open(file_path, "wb") as f, tqdm(
        total=total_size, unit='B', unit_scale=True, desc=filename
    ) as pbar:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                pbar.update(len(chunk))
    
    print(f"✅ Finished downloading {filename}")
    return file_path

if __name__ == "__main__":
    models_dir = os.path.join(os.getcwd(), "models")
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)

    # 1. YOLO v8 Nano model
    yolo_url = "https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n.pt"
    download_file(yolo_url, models_dir)
    
    # 2. DeepFace VGG-Face model
    # DeepFace expects weights in a subfolder called "weights" inside the DEEPFACE_HOME
    weights_dir = os.path.join(models_dir, ".deepface", "weights")
    vgg_face_url = "https://github.com/serengil/deepface_models/releases/download/v1.0/vgg_face_weights.h5"
    download_file(vgg_face_url, weights_dir)
    
    print("\n🚀 All core models are now stored in the '/models' folder.")
    print("Environment variable 'DEEPFACE_HOME' should be set to the models directory.")
