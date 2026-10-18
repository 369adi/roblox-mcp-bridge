"""Attach observations to completed actions; never replay an action on capture failure."""
import copy
import json


def attach_capture(result, capture):
    merged=copy.deepcopy(result)
    try:
        observation=capture()
        if observation.get('isError') or not any(c.get('type')=='image' for c in observation.get('content',[])):
            reason=' '.join(c.get('text','') for c in observation.get('content',[]) if c.get('type')=='text')[:600]
            raise RuntimeError(reason or 'No image was returned')
        merged.setdefault('content',[]).extend(observation['content'])
        feedback={'auto_visual_feedback':'captured','instruction':'Inspect the attached image before proceeding. Correct visible problems within the requested scope; do not claim visual review without inspecting it. Only window/desktop UI capture_ids authorize UI input; Studio renderer images do not.'}
    except Exception as exc:
        feedback={'auto_visual_feedback':'capture_failed','action_result_unchanged':True,'reason':str(exc)[:600],
                  'instruction':'Do NOT rerun the action just because capture failed. Inspect actual state; retry only the screenshot. Do not claim visual verification.'}
    merged.setdefault('content',[]).append({'type':'text','text':json.dumps(feedback)})
    return merged
