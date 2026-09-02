// Pure policy: would this shell command stop the systemd unit we run inside?
// ponytail: text match only. A stop from inside the unit's cgroup kills the
// shell issuing it, so nothing after it (a later `start`) ever runs and every
// live session on the host dies. Origin: 2026-09-02 forge outage, where markdown
// backticks inside a double-quoted `ssh host "cat > runbook <<'EOF' ..."` body
// expanded LOCALLY and ran `systemctl --user stop deepseek-harness.service`.
import { readFileSync } from "node:fs";

export function ownUnit(cgroupText) {
  const m = /\/([^/\n]+\.service)\s*$/m.exec(cgroupText ?? "");
  return m ? m[1] : null;
}

export function readOwnUnit() {
  try { return ownUnit(readFileSync("/proc/self/cgroup", "utf8")); } catch { return null; }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function decide(command, unit) {
  if (!unit || typeof command !== "string") return { kind: "allow" };
  const base = unit.replace(/\.service$/, "");
  // restart/try-restart added 2026-09-02: a restart from inside a session ends
  // EVERY live session on the host at once (mesh rows die as TIMEOUT, the
  // operator's interactive turns stop mid-thought). Session d44cf013 restarted
  // the harness three times in one morning to reload a rebuilt web plugin.
  // The sanctioned path is `dsh-safe-restart`, which drains active turns,
  // records who was mid-turn for resume-on-boot, and restarts out-of-band.
  const re = new RegExp(`systemctl\\b[^\\n;&|]*?\\b(stop|kill|restart|try-restart)\\b[^\\n;&|]*?\\b${esc(base)}(\\.service)?\\b`);
  const m = re.exec(command);
  if (!m) return { kind: "allow" };
  const verb = m[1];
  const isRestart = verb === "restart" || verb === "try-restart";
  return {
    kind: "deny",
    reason:
      `Refused: this command would \`systemctl ${verb}\` ${unit}, the unit this session runs inside. ` +
      (isRestart
        ? `A restart from inside a session kills THIS shell and EVERY live session on the host at once (mesh tasks die as ` +
          `TIMEOUT, the operator's interactive turns stop mid-thought). Use \`dsh-safe-restart --reason "<why>"\` instead: it ` +
          `waits until no other session is mid-turn and no mesh-pump row is processing, records the sessions it will ` +
          `interrupt for resume-on-boot, then restarts out-of-band. Add \`--now\` only when the operator explicitly wants ` +
          `an immediate restart. Client-plugin changes reload without any restart while \`pnpm run dev:web\` is running.`
        : `The stop kills this shell and every live session on the host, and any later \`start\` never runs. ` +
          `If the text is only documentation, write it with a file tool or a top-level quoted heredoc — never inside a ` +
          `double-quoted ssh/bash -c string, where backticks expand locally before the remote ever sees them. ` +
          `To restart safely: dsh-safe-restart --reason "<why>"`),
  };
}
