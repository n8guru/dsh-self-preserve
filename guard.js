// Pure policy: would this shell command stop the service we run inside?
// Linux discovers the systemd unit from /proc/self/cgroup. Other supervisors
// can provide DSH_SELF_PRESERVE_TARGET (for example a macOS launchd label).
import { readFileSync } from "node:fs";

export function ownUnit(cgroupText, configured = process.env.DSH_SELF_PRESERVE_TARGET) {
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  const m = /\/([^/\n]+\.service)\s*$/m.exec(cgroupText ?? "");
  return m ? m[1] : null;
}

export function readOwnUnit() {
  const configured = process.env.DSH_SELF_PRESERVE_TARGET;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  try { return ownUnit(readFileSync("/proc/self/cgroup", "utf8"), ""); } catch { return null; }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function denySystemd(command, unit) {
  const base = unit.replace(/\.service$/, "");
  const re = new RegExp(`systemctl\\b[^\\n;&|]*?\\b(stop|kill|restart|try-restart)\\b[^\\n;&|]*?\\b${esc(base)}(\\.service)?\\b`);
  const m = re.exec(command);
  if (!m) return null;
  const verb = m[1];
  const isRestart = verb === "restart" || verb === "try-restart";
  return {
    kind: "deny",
    reason:
      `Refused: this command would \`systemctl ${verb}\` ${unit}, the unit this session runs inside. ` +
      (isRestart
        ? `A restart from inside a session kills THIS shell and EVERY live session on the host at once. ` +
          `Use \`dsh-safe-restart --reason "<why>"\` from an external supervisor instead.`
        : `The stop kills this shell and every live session on the host, and any later start never runs. ` +
          `If the text is documentation, write it with a file tool or a top-level quoted heredoc. ` +
          `Restart only from an external supervisor.`),
  };
}

function denyLaunchd(command, label) {
  const re = new RegExp(`launchctl\\b[^\\n;&|]*?\\b(stop|kill|remove|bootout|unload|kickstart)\\b[^\\n;&|]*?${esc(label)}\\b`);
  const m = re.exec(command);
  if (!m) return null;
  return {
    kind: "deny",
    reason:
      `Refused: this command would \`launchctl ${m[1]}\` ${label}, the launchd job this session runs inside. ` +
      `That can kill this shell and every live DSH session on the host. Restart it from another machine or terminal.`,
  };
}

export function decide(command, target) {
  if (!target || typeof command !== "string") return { kind: "allow" };
  const denial = target.endsWith(".service")
    ? denySystemd(command, target)
    : denyLaunchd(command, target);
  return denial ?? { kind: "allow" };
}
