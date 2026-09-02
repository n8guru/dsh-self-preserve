# dsh-self-preserve

A tiny [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) hook plugin that stops a model session from stopping the harness it is running inside.

## The failure it prevents

`dsh web` runs as a systemd user service. A session used the `bash` tool to write a runbook on another host:

```sh
ssh peer "cat > RUNBOOK.md <<'EOF'
1. `systemctl --user stop deepseek-harness.service`
5. `systemctl --user start deepseek-harness.service`
EOF"
```

The body sits inside a **double-quoted** string, so the local shell evaluates the markdown backticks as command substitutions before `ssh` runs. Step 1 stopped the harness the session lived in. The bash subprocess is in the harness's cgroup, so the stop killed the issuing shell, step 5 never ran, every live session on the host ended, and the unit stayed down (clean exit, so `Restart=on-failure` never fires).

Journal fingerprint:

```
systemd: Reloading requested from client PID 2608960 ('systemctl') (unit deepseek-harness.service)...
systemd: Stopping deepseek-harness.service ...
systemd: Stopped deepseek-harness.service ...
```
with no `Starting` afterwards.

## What it does

On `tools/pre-execute` it reads the Linux unit name from `/proc/self/cgroup` and returns `{kind: "deny"}` for any tool `command` matching `systemctl … (stop|kill|restart|try-restart) … <own unit>`. For non-systemd supervisors, set `DSH_SELF_PRESERVE_TARGET` to the service label; macOS launchd stop, kill, remove, bootout, unload, and kickstart commands targeting that label are denied.

The plugin logs `[dsh-self-preserve] armed for <target>` when protection is active. If no target can be discovered or configured, it logs an explicit inactive warning. Restarts must be initiated out of band, from another machine or external supervisor. Read-only status commands and operations on other services stay allowed.

## Install (profile as a local package)

```sh
git clone https://github.com/n8guru/dsh-self-preserve ~/.dsh/local-mods/dsh-self-preserve
cd ~/.dsh/profiles/web      # and profiles/headless if you use it
# package.json: add to "dependencies" and to dsh.profile.bundles
#   "dsh-self-preserve": "file:../../local-mods/dsh-self-preserve"
pnpm install --ignore-workspace
# Restart from another machine or an external supervisor.
```

## Test

```sh
node --test guard.test.mjs
```

## Files

- `guard.js` pure policy (`ownUnit`, `decide`) so it can be tested without a harness
- `index.js` the Cordis plugin: one `ctx.on("tools/pre-execute", …)` listener
- `cordis.patch.yml` mounts the hook as a profile row; listing a package in `dsh.profile.bundles` only composes its patch and does not mount `index.js` by itself

MIT.
