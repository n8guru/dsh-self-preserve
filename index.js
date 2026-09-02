import { decide, readOwnUnit } from "./guard.js";

export const name = "dsh-self-preserve";
export const inject = ["tools"];

export function apply(ctx) {
  const unit = readOwnUnit();
  if (!unit) return; // not under a systemd service: nothing to protect
  ctx.on("tools/pre-execute", (exec, next) => {
    const d = decide(exec.arguments?.command, unit);
    return d.kind === "deny" ? Promise.resolve(d) : next();
  });
}
