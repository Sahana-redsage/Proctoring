from ultralytics import YOLO

# Load once (important)
_model = YOLO("yolov8n.pt")

PHONE_CLASSES = {"cell phone"}
OBJECT_CLASSES = {"book", "laptop", "remote", "keyboard", "mouse", "paper"}

def detect_yolo_objects(frame):
    results = _model(frame, verbose=False)[0]

    phones = []
    objects = []

    for box in results.boxes:
        cls_id = int(box.cls[0])
        cls_name = results.names[cls_id]

        conf = float(box.conf[0])

        if cls_name in PHONE_CLASSES:
            phones.append(conf)

        elif cls_name in OBJECT_CLASSES:
            objects.append(conf)

    return phones, objects
