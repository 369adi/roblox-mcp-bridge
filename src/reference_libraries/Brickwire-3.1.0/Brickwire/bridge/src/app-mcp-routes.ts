import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import type http from "node:http";
import type { Bridge } from "./bridge.js";

export function appMcpAsset(p: string, dashFile: string | null) {
  const files: Record<string,[string,string]> = { "/mcp":["mcp.html","text/html; charset=utf-8"], "/app-mcp.js":["app-mcp-ui.js","text/javascript; charset=utf-8"], "/app-mcp.css":["app-mcp.css","text/css; charset=utf-8"] };
  const item = files[p]; if (!item || !dashFile) return null;
  const file = path.join(path.dirname(dashFile),item[0]);
  return fs.existsSync(file) ? {file,type:item[1]} : null;
}
export async function handleAppMcp(ctx: { bridge: Bridge; req: http.IncomingMessage; res: http.ServerResponse; pathname: string; body: Record<string,any>; token:string; send:(status:number,body:unknown,headers?:Record<string,string>)=>unknown }) {
  const {bridge,req,pathname:p,body,token,send} = ctx;
  const manager = bridge.appMcp;
  if (req.method === "GET" && p === "/api/app-mcp/summary") {
    return send(200,{ servers:manager.list().map(s=>({id:s.id,name:s.name,status:s.status,toolCount:s.toolCount,error:s.error})), studio:{state:bridge.mcp.state, tools:bridge.mcp.tools.length}, error:manager.loadError });
  }
  // New management surface is app-only. Existing extension API remains unchanged.
  if (req.method === "GET" && p === "/api/app-mcp/access") {
    const allowed = [ `http://127.0.0.1:${bridge.config.port}`, `http://localhost:${bridge.config.port}` ];
    let ref: URL; try { ref = new URL(req.headers.referer ?? ""); } catch { return send(403,{error:"Open the MCP workspace in the local application"}); }
    if (!allowed.includes(ref.origin) || !["/app","/mcp"].includes(ref.pathname) || req.headers["sec-fetch-site"] !== "same-origin") return send(403,{error:"Application session required"});
    return send(200,{token});
  }
  const supplied = req.headers["x-brickwire-app"];
  if (typeof supplied !== "string" || supplied.length !== token.length || !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(token))) return send(403,{error:"Open/reload the MCP workspace to authorize this application session"});
  try {
    if (req.method === "GET" && p === "/api/app-mcp/servers") return send(200,{ servers:manager.list(), error:manager.loadError, transports:["stdio"], studio:{id:"builtin-studio",name:"Roblox Studio",state:bridge.mcp.state,error:manager.sanitize(bridge.mcp.lastError),toolCount:bridge.mcp.tools.length,info:manager.sanitize(bridge.mcp.serverInfo),managedExternally:true} });
    if (req.method === "POST" && p === "/api/app-mcp/servers") return send(201,{ok:true,id:manager.add(body)});
    const match = p.match(/^\/api\/app-mcp\/servers\/(mc_[a-f0-9]{12})\/(edit|enable|remove|connect|disconnect|refresh|permissions|invoke|resource|prompt)$/);
    if (req.method !== "POST" || !match) return send(404,{error:"MCP route not found"});
    const [,id,action] = match;
    if (action === "edit") await manager.edit(id,body);
    else if (action === "enable") { if(typeof body.enabled !== "boolean") return send(400,{error:"enabled must be boolean"}); await manager.enable(id,body.enabled); }
    else if (action === "remove") await manager.remove(id,body.confirm === true);
    else if (action === "connect") await manager.connect(id);
    else if (action === "disconnect") await manager.disconnect(id);
    else if (action === "refresh") await manager.refresh(id);
    else if (action === "permissions") manager.permissions(id,body);
    else if (action === "resource" || action === "prompt") return send(200,await manager.read(id,action,body));
    else if (action === "invoke") {
      const descriptor = manager.manualDescriptor(id,String(body.tool ?? ""));
      const call = {id:"app_mcp_"+crypto.randomBytes(5).toString("hex"),tool:descriptor.name,args:body.args ?? {}};
      const env = await bridge.submitCall(call,{provider:"app-mcp"},100);
      return send(200,env);
    }
    return send(200,{ok:true});
  } catch(e) { return send((e as {status?:number}).status ?? 500,{error:manager.sanitize((e as Error).message)}); }
}
