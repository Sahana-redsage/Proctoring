from processors.frame_sampler import sample_frames
from detectors.face_detector import count_faces
from detectors.yolo_detector import detect_yolo_objects
from detectors.gaze_detector import is_looking_away
from detectors.identity_verifier import verify_identity
from app.repositories.sessions import get_reference_image
from processors.event_aggregator import EventAggregator

EVENT_DEBOUNCE_SEC = 2

def analyze_chunk(video_path, session_id, chunk_index, chunk_start_sec):
    frames = sample_frames(video_path)
    active = {}
    finalized = []
    reference_image_url = get_reference_image(session_id)

    for ts, frame in frames:
        abs_time = chunk_start_sec + ts
        
        # 1. Identity Check (Now integrated into the loop)
        # identity_result is True if it matches, False if mismatch
        is_mismatch = (verify_identity(frame, reference_image_url) is False)
        _event(is_mismatch, "IDENTITY_MISMATCH", abs_time, 0.9, active, finalized)

        # 2. Face Based
        face_count = count_faces(frame)
        _event(face_count == 0, "NO_FACE", abs_time, 0.9, active, finalized)
        _event(face_count > 1, "MULTIPLE_PEOPLE", abs_time, 0.95, active, finalized)

        # 3. Gaze & YOLO
        _event(is_looking_away(frame), "LOOKING_AWAY", abs_time, 0.8, active, finalized)
        
        phones, objects = detect_yolo_objects(frame)
        _event(len(phones) > 0, "PHONE_USAGE", abs_time, max(phones, default=0.0), active, finalized)
        _event(len(objects) > 0, "SUSPECTED_OBJECTS_DETECTED", abs_time, max(objects, default=0.0), active, finalized)

    # Finalize any remaining active events
    for evt in active.values():
        finalized.append(evt)

    return [
        evt.to_record(session_id, chunk_index)
        for evt in finalized
        if evt.end_time - evt.start_time >= EVENT_DEBOUNCE_SEC
    ]
def _event(condition, event_type, ts, confidence, active, finalized):
    if condition:
        if event_type not in active:
            active[event_type] = EventAggregator(event_type, ts, confidence)
        else:
            active[event_type].update(ts, confidence)
    else:
        if event_type in active:
            evt = active.pop(event_type)
            evt.update(ts, evt.confidence)
            finalized.append(evt)
