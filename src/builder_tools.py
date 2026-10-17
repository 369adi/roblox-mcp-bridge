"""Small Edit-only helpers; one call instead of repeated loader boilerplate."""
import json
from workspace_tools import spec

STUDIO = {'type': 'string'}
TARGET = {'type': 'string', 'description': 'Exact dotted instance path, e.g. Workspace.House; duplicate sibling names are rejected.'}
CONTEXT_TOOL = spec('roblox_context', 'Optional once-per-chat rules/short skill/design bundle. Reuse chat_id. FAST or rules_read skips loading. Never required before building.',
    {'chat_id': {'type': 'string'}, 'mode': {'type': 'string', 'enum': ['NORMAL', 'FAST']}, 'rules_read': {'type': 'boolean'},
     'include_skill': {'type': 'boolean'}, 'design_namespace': {'type': 'string'}}, ['chat_id'])
BUILDER_TOOLS = [
    spec('run_builder', 'Run authorized Luau in Edit with ChangeHistory recording and optional fresh cloned ModuleScript loader. builder is require(clone); clone cleaned up even on error. Partial changes on error remain undoable, not automatically rolled back. Module may be an exact path or unique name. No Play.',
         {'studio_id': STUDIO, 'module': {'type': 'string'}, 'code': {'type': 'string'}}, ['studio_id', 'code'], readonly=False),
    spec('model_summary', 'Compact model/BasePart summary: counts, top 10 shapes/colors, bounding box. No per-part dump.',
         {'studio_id': STUDIO, 'path': TARGET}, ['studio_id', 'path']),
    spec('model_check', 'Read-only bounded candidate check: fix=Ball/thin geometry, floating=no nearby support, faces=identical visible part transforms. Counts and at most 10 examples; heuristics, NOT proof of no coplanarity/flicker. Does not repair.',
         {'studio_id': STUDIO, 'path': TARGET, 'check': {'type': 'string', 'enum': ['all', 'fix', 'floating', 'faces']}}, ['studio_id', 'path']),
]

RESOLVE = '''local function resolve(path)
 local current=game
 local segments=string.split(path,'.')
 for _,name in ipairs(segments) do
  if name~='game' and name~='' then
   if current==game and name=='workspace' then name='Workspace' end
   local found=nil
   for _,child in ipairs(current:GetChildren()) do
    if child.Name==name then assert(not found,'Ambiguous path: '..path); found=child end
   end
   assert(found,'Missing path: '..path); current=found
  end
 end
 return current
end
'''


class BuilderTools:
    def __init__(self, gateway):
        self.gateway = gateway

    def execute(self, args, code):
        studio = args.get('studio_id')
        if not isinstance(studio, str) or not studio.strip():
            raise ValueError('studio_id required')
        code = "assert(game:GetService('RunService'):IsEdit(), 'Edit mode required; Play is manual')\n" + code
        return self.gateway.call({'name': 'execute_luau', 'arguments': {'studio_id': studio, 'datamodel_type': 'Edit', 'code': code}})

    def run(self, args):
        code, module = args.get('code'), args.get('module')
        if not isinstance(code, str) or not code.strip() or len(code) > 200000:
            raise ValueError('code must be 1..200000 characters')
        if module is not None and (not isinstance(module, str) or not module or len(module) > 500):
            raise ValueError('module must be a nonempty exact path or unique name')
        # JSON string escaping is valid for these Luau string literals (ASCII escaped below).
        literal = json.dumps(module or '', ensure_ascii=False)
        wrapped = RESOLVE + '''local clone=nil
local history=game:GetService('ChangeHistoryService')
local recording=history:TryBeginRecording('MCP Builder', 'MCP Builder')
assert(recording,'Cannot start ChangeHistory recording; no builder ran')
local ok,result=xpcall(function()
 local builder=nil
 local moduleName=MODULE_NAME
 if moduleName~='' then
  local source=nil
  if string.find(moduleName,'.',1,true) then source=resolve(moduleName)
  else
   for i,item in ipairs(game:GetDescendants()) do
    if item:IsA('ModuleScript') and item.Name==moduleName then assert(not source,'Ambiguous module name'); source=item end
    if i%1000==0 then task.wait() end
   end
  end
  assert(source and source:IsA('ModuleScript'),'ModuleScript not found')
  clone=source:Clone(); assert(clone,'Module is not Archivable')
  clone.Name=source.Name..'_MCP_'..game:GetService('HttpService'):GenerateGUID(false)
  clone.Parent=source.Parent
  builder=require(clone)
 end
 return (function()
USER_CODE
 end)()
end,debug.traceback)
if clone then clone:Destroy() end
history:FinishRecording(recording,Enum.FinishRecordingOperation.Commit)
if not ok then error('Builder failed; partial changes may remain. Undo MCP Builder before retrying. '..tostring(result)) end
return result
'''.replace('MODULE_NAME', literal).replace('USER_CODE', code)
        return self.execute(args, wrapped)

    def summary(self, args):
        return self.execute(args, self._target(args) + '''
local shapes,colors={},{}
local n,visible=0,0
for i,p in ipairs(items) do
 if p:IsA('BasePart') then
  n+=1; if p.Transparency<1 then visible+=1 end
  local shape=p:IsA('Part') and p.Shape.Name or p.ClassName
  shapes[shape]=(shapes[shape] or 0)+1
  local c=p.Color:ToHex(); colors[c]=(colors[c] or 0)+1
 end
 if i%1000==0 then task.wait() end
end
local function top(counts)
 local rows={}; for name,count in pairs(counts) do table.insert(rows,{name=name,count=count}) end
 table.sort(rows,function(a,b) return a.count>b.count end)
 local total=#rows; while #rows>10 do table.remove(rows) end
 return {distinct=total,top=rows}
end
local cf,size
if target:IsA('Model') then cf,size=target:GetBoundingBox()
elseif target:IsA('BasePart') then cf,size=target.CFrame,target.Size end
local box=nil
if cf then box={position={cf.X,cf.Y,cf.Z},size={size.X,size.Y,size.Z}} end
return game:GetService('HttpService'):JSONEncode({parts=n,visible=visible,shapes=top(shapes),colors=top(colors),bounding_box=box})
''')

    @staticmethod
    def _target(args):
        path = args.get('path')
        if not isinstance(path, str) or not path.strip() or len(path) > 1000:
            raise ValueError('path required, at most 1000 characters')
        return RESOLVE + '\nlocal target=resolve(' + json.dumps(path, ensure_ascii=False) + ')\nlocal items=target:GetDescendants(); table.insert(items,1,target)\n'

    def check(self, args):
        kind = args.get('check', 'all')
        if kind not in ('all', 'fix', 'floating', 'faces'):
            raise ValueError('Unknown check')
        return self.execute(args, self._target(args) + '\nlocal kind=' + json.dumps(kind) + '''
local counts={ball=0,thin=0,unsupported_candidate=0,duplicate_transform_candidate=0}
local examples,seen={},{}
local visited=0
local truncated=false
local deadline=os.clock()+3
local function issue(key,p)
 counts[key]+=1
 if #examples<10 then table.insert(examples,{kind=key,path=string.sub(p:GetFullName(),1,160)}) end
end
for i,p in ipairs(items) do
 if p:IsA('BasePart') then
  visited+=1
  if visited>10000 or os.clock()>deadline then truncated=true; break end
  if kind=='all' or kind=='fix' then
   if p:IsA('Part') and p.Shape==Enum.PartType.Ball then issue('ball',p) end
   if math.min(p.Size.X,p.Size.Y,p.Size.Z)<0.01 then issue('thin',p) end
  end
  if (kind=='all' or kind=='faces') and p.Transparency<1 then
   local key=tostring(p.CFrame)..'|'..tostring(p.Size)..'|'..p.ClassName..'|'..(p:IsA('Part') and p.Shape.Name or '')
   if seen[key] then issue('duplicate_transform_candidate',p) else seen[key]=true end
  end
  if kind=='all' or kind=='floating' then
   local params=RaycastParams.new(); params.FilterType=Enum.RaycastFilterType.Exclude; params.FilterDescendantsInstances={p}
   local extent=(math.abs(p.CFrame.RightVector.Y)*p.Size.X+math.abs(p.CFrame.UpVector.Y)*p.Size.Y+math.abs(p.CFrame.LookVector.Y)*p.Size.Z)/2
   if not workspace:Raycast(p.Position,Vector3.new(0,-extent-0.3,0),params) then issue('unsupported_candidate',p) end
  end
 end
 if i%500==0 then task.wait() end
end
return game:GetService('HttpService'):JSONEncode({counts=counts,examples=examples,checked_parts=math.min(visited,10000),truncated=truncated,heuristic_only=true,automatic_fixes=false})
''')

    def handlers(self):
        return {'run_builder': self.run, 'model_summary': self.summary, 'model_check': self.check}
