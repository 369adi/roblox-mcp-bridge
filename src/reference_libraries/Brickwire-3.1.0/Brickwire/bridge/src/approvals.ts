import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { ApprovalRequest } from "../../shared/src/protocol.js";

export class ApprovalManager extends EventEmitter {
  private pending = new Map<string, { req: ApprovalRequest; resolve: (ok: boolean) => void; timer: NodeJS.Timeout }>();

  request(req: Omit<ApprovalRequest, "id" | "createdAt">, timeoutMs: number): { approval: ApprovalRequest; decision: Promise<boolean | "timeout"> } {
    const approval: ApprovalRequest = { ...req, id: "ap_" + crypto.randomBytes(4).toString("hex"), createdAt: new Date().toISOString() };
    const decision = new Promise<boolean | "timeout">((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(approval.id);
        this.emit("changed");
        resolve("timeout");
      }, timeoutMs);
      this.pending.set(approval.id, { req: approval, resolve: (ok) => resolve(ok), timer });
    });
    this.emit("changed");
    return { approval, decision };
  }

  decide(id: string, approve: boolean): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(approve);
    this.emit("changed");
    return true;
  }

  rejectAll() {
    for (const id of [...this.pending.keys()]) this.decide(id, false);
  }

  list(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.req);
  }
}
