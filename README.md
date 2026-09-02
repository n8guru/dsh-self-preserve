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

On `tools/pre-execute` it reads the unit name from `/proc/self/cgroup` and returns `{kind: "deny"}` for any tool `command` matching `systemctl … (stop|kill) … <own unit>`. The deny reason tells the model why and gives the out-of-band route:

```
systemd-run --user --on-active=5 systemctl --user restart deepseek-harness.service
```

`restart` and `status` stay allowed. Outside a systemd service the plugin registers nothing.

## Install (profile as a local package)

```sh
git clone https://github.com/n8guru/dsh-self-preserve ~/.dsh/local-mods/dsh-self-preserve
cd ~/.dsh/profiles/web      # and profiles/headless if you use it
# package.json: add to "dependencies" and to dsh.profile.bundles
#   "dsh-self-preserve": "file:../../local-mods/dsh-self-preserve"
pnpm install --ignore-workspace
systemctl --user restart deepseek-harness.service
```

## Test

```sh
node --test guard.test.mjs
```

## Files

- `guard.js` pure policy (`ownUnit`, `decide`) so it can be tested without a harness
- `index.js` the Cordis plugin: one `ctx.on("tools/pre-execute", …)` listener
- `cordis.patch.yml` empty; a host-only hook needs no bundle rows

MIT.
