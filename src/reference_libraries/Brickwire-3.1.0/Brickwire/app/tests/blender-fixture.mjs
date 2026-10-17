// Test-only MCP server that mimics the Blender MCP tool surface (names reported dynamically).
import readline from 'node:readline';
const objects = ['Camera', 'Light'];
const send = (id, result) => console.log(JSON.stringify({ jsonrpc: '2.0', id, result }));
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let q; try { q = JSON.parse(line); } catch { return; } if (q.id === undefined) return;
  if (q.method === 'initialize') return send(q.id, { protocolVersion: '2024-11-05', serverInfo: { name: 'BlenderMCP fixture', version: '1' }, capabilities: { tools: {} } });
  if (q.method === 'tools/list') return send(q.id, { tools: [
    { name: 'get_scene_info', description: 'Scene info', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
    { name: 'execute_blender_code', description: 'Execute Python in Blender', inputSchema: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } } },
  ] });
  if (q.method === 'tools/call') {
    if (q.params.name === 'get_scene_info') return send(q.id, { content: [{ type: 'text', text: JSON.stringify({ name: 'Scene', object_count: objects.length, objects }) }] });
    const code = String(q.params.arguments?.code ?? '');
    const m = code.match(/p = "([^"]+)"/);
    if (!m || !/obj_import|import_scene\.obj/.test(code)) return send(q.id, { isError: true, content: [{ type: 'text', text: 'unexpected script' }] });
    // emulate Blender's OBJ importer: one object per "o" line in the real file
    import('node:fs').then((fs) => {
      const names = fs.readFileSync(m[1], 'utf8').split('\n').filter((l) => l.startsWith('o ')).map((l) => l.slice(2).trim());
      objects.push(...names);
      send(q.id, { content: [{ type: 'text', text: `BRICKWIRE_IMPORTED ${names.length} ${names.join(',')}` }] });
    });
    return;
  }
  console.log(JSON.stringify({ jsonrpc: '2.0', id: q.id, error: { code: -32601, message: 'Not supported' } }));
});
