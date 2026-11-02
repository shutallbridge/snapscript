# The rig's Pi

The rig's Raspberry Pi 5 is `ironbridge.local`. Reach it with the `rig` SSH alias:

- **Run a command**: `ssh rig '<command>'`
- **Copy files**: `rsync -a <local_dir>/ rig:<remote_dir>/` (or `scp <file> rig:<path>`)

The alias and its key live in the owner's `~/.ssh` on the Mac, so it works from every worktree. Login is by key alone: scripts, READMEs and commands use plain `ssh rig`, with no password and no helper script. When `ssh rig` fails, stop and tell the owner what it printed; the Pi may be off, or the alias needs fixing on their side.
