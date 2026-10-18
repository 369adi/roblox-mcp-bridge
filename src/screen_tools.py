"""Studio-only capture schemas. No OS desktop/window capture implementation."""

SCREEN_TOOLS = [{'name': 'capture_get', 'description': 'Retrieve a bounded stored Studio image or pixel crop by capture_id. No new screenshot and never OS capture.', 'inputSchema': {'type': 'object', 'additionalProperties': False, 'required': ['capture_id'], 'properties': {'capture_id': {'type': 'string'}, 'view': {'type':'integer','description':'Original unscaled Studio view index.'}, 'return_mode': {'type':'string','enum':['inline','file','preview']}, 'width': {'type': 'integer', 'maximum': 1920}, 'height': {'type': 'integer', 'maximum': 1080}, 'crop': {'type': 'array', 'items': {'type': 'integer'}, 'minItems': 4, 'maxItems': 4}, 'format': {'type': 'string', 'enum': ['jpeg','webp','png']}, 'quality': {'type': 'integer'}, 'max_bytes': {'type': 'integer'}, 'max_tokens': {'type': 'integer'}}}}, {
    'name': 'screen_windows',
    'description': 'Compatibility alias for roblox_studios: list connected Roblox Studio instances and their studio_id for screen_capture. Does not enumerate desktop windows or return OS window handles.',
    'inputSchema': {'type': 'object', 'properties': {}},
    'annotations': {'readOnlyHint': True},
}]


def capture_schema():
    return {'name': 'screen_capture',
            'description': 'Capture ONLY Roblox Studio rendered content. Default 1280x720 JPEG quality 82, preserving detail. No automatic shrinking or camera zoom to satisfy byte limits; use preview explicitly. Requires studio_id from roblox_studios. Never captures desktop pixels, a monitor, an OS window or a desktop region. If Studio capture is unavailable, fail without a desktop fallback. No Play is started. Image coordinates are not desktop mouse coordinates.',
            'inputSchema': {'type': 'object', 'additionalProperties': False,
                            'properties': {
                                           'width': {'type':'integer','minimum':64,'maximum':1920,'default':1280},
                                           'height': {'type':'integer','minimum':36,'maximum':1080,'default':720},
                                           'max_bytes': {'type':'integer','minimum':1500,'maximum':8388608,'default':1048576},
                                           'max_tokens': {'type':'integer','description':'Deprecated; not used to resize or estimate image tokens.'},
                                           'return_mode': {'type':'string','enum':['preview','file','inline'],'default':'inline'},
                                           'views': {'type':'array','maxItems':4,'items':{'oneOf':[{'type':'string'},{'type':'object'}]}},
                                           'target': {'type':'string'}, 'padding': {'type':'number'},
                                           'fov': {'type':'number','description':'Currently unsupported; explicit error rather than scene mutation.'},
                                           'hide_ui': {'type':'boolean','default':True,'description':'Studio rendered output; native overlay toggle not exposed.'},
                                           'isolate': {'type':'boolean','description':'Currently unsupported; explicit error if true.'},
                                           'radius': {'type':'number'},
                                           'neutral_lighting': {'type':'boolean','description':'Currently unsupported; explicit error if true.'},
                                           'annotate': {'type':'boolean','description':'Currently unsupported; explicit error if true.'},
                                           'compare_to': {'type':'string'}, 'skip_unchanged': {'type':'boolean','default':False},
                                           'studio_id': {'type': 'string'}, 'capture_id': {'type': 'string'},
                                           'camera_position': {'type': 'array', 'items': {'type': 'number'}, 'minItems': 3, 'maxItems': 3},
                                           'look_at_position': {'type': 'array', 'items': {'type': 'number'}, 'minItems': 3, 'maxItems': 3},
                                           'max_width': {'type': 'integer', 'minimum': 160, 'maximum': 1920, 'default': 1280},
                                           'quality': {'type': 'integer', 'minimum': 1, 'maximum': 100, 'default': 82},
                                           'format': {'type': 'string', 'enum': ['jpeg', 'webp', 'png'], 'default': 'jpeg'},
                                           'output': {'type': 'string', 'enum': ['image', 'file'], 'default': 'image', 'description': 'file returns PC-local path only, not a remote download link.'}},
                            'required': ['studio_id']},
            'annotations': {'readOnlyHint': True}}
