import cv2

def sample_frames(video_path, sample_every_sec=1):
    cap = cv2.VideoCapture(video_path)

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 25

    frame_interval = int(fps * sample_every_sec)
    frame_idx = 0
    frames = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            timestamp = frame_idx / fps
            frames.append((timestamp, frame))

        frame_idx += 1

    cap.release()
    return frames
