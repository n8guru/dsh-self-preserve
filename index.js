import { decide, readOwnUnit } from "./guard.js";

export const name = "dsh-self-preserve";
export const inject = ["tools"];

export function apply(ctx) {
  const unit = readOwnUnit();
  if (!unit) {
    console.warn("[dsh-self-preserve] inactive: no systemd unit or DSH_SELF_PRESERVE_TARGET");
    return;
  }
  console.log(`[dsh-self-preserve] armed for ${unit}`);
  ctx.on("tools/pre-execute", (exec, next) => {
    const d = decide(exec.arguments?.command, unit);
    return d.kind === "deny" ? Promise.resolve(d) : next();
  });
}
