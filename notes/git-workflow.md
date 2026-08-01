# How this project is versioned (working agreement)

There are TWO independent histories, and confusing them is what caused the
overwrite on 1 Aug 2026.

| Remote | What it is | Who writes to it |
|---|---|---|
| `origin` (s3://…) | The Manus project store. Every `webdev_save_checkpoint` writes here. This is what the Preview and Publish use. | Manus, automatically |
| `github` (hovangr22/Accounts-Receivables) | A mirror for external visibility. Nothing in the app reads from it. | Manus (manual push) and, as it turns out, GitHub-side edits |

## What went wrong
`f781da7 feat: Add Context-Centric Activity Feed with @mentions support` was
committed **on GitHub** (author `hovangr22`, 21:47) on top of checkpoint
`cd7f01e`. That work never existed in the sandbox working tree — no
`ActivityFeed.tsx`, no mention procedures. Meanwhile the sandbox continued from
`cd7f01e` with its own checkpoints (`a6e7bc6`, `bf884b4`), so the two histories
diverged. Pushing the sandbox history with `--force-with-lease` replaced the
GitHub-only commit.

## Rules from here on
1. **The Manus checkpoint chain (`origin`) is the single source of truth.** The
   running app, the Preview and Publish all come from there.
2. **Do not commit code directly on GitHub** while a Manus session is working on
   the project. Those commits are invisible to the sandbox and will collide.
3. Manus **never force-pushes** to `github` again. If the histories have
   diverged, Manus stops and asks — a divergence means someone edited GitHub
   directly.
4. To bring GitHub-side work into the project, it must be merged into the
   sandbox working tree and saved as a checkpoint, so `origin` and `github`
   agree again.
5. Best practice for parallel work: ask in the Manus session, or use the
   Management UI (Settings → GitHub) export, rather than editing GitHub by hand.

## Recovering f781da7 if wanted
The commit is still reachable locally: `git show f781da7`. Its content is 5
files (ActivityFeed.tsx + mention procedures). It can be cherry-picked into the
working tree and checkpointed — nothing is lost.
