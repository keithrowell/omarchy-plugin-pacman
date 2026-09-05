import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, readlinkSync, lstatSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// bin/install against a scratch HOME. The desktop file, the launcher symlink
// and the printed menu snippet are checked; nothing under the real HOME is
// touched (HOME and XDG_DATA_HOME both point at the scratch directory, and
// PATH is limited so the result does not depend on the caller's shell).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL = join(ROOT, "bin", "install");
const LAUNCH = join(ROOT, "bin", "pacman");
const ICON = join(ROOT, "assets", "icon.png");

function scratchHome() {
  const home = mkdtempSync(join(tmpdir(), "pacman-install-"));
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  return home;
}

function run(home, args = [], env = {}) {
  const result = spawnSync(INSTALL, args, {
    encoding: "utf8",
    env: {
      HOME: home,
      XDG_DATA_HOME: join(home, ".local", "share"),
      PATH: "/usr/bin:/bin",
      ...env,
    },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const desktopPath = home => join(home, ".local", "share", "applications", "Pacman.desktop");
const launcherPath = home => join(home, ".local", "bin", "omarchy-pacman");

// The snippet is the block from `"pacman": {` to its closing brace; wrapped in
// braces it must be plain JSON.
function snippet(out) {
  const lines = out.split("\n");
  const start = lines.findIndex(l => /^\s*"pacman": \{/.test(l));
  assert.ok(start >= 0, "snippet present");
  const end = lines.findIndex((l, i) => i > start && /^\s*\}\s*$/.test(l));
  assert.ok(end > start, "snippet closed");
  return JSON.parse("{" + lines.slice(start, end + 1).join("\n") + "}").pacman;
}

// A PATH with every tool the installer needs except uwsm-app. Also lacks
// `qs` and `pacman`, so the requirements check reports quickshell missing
// (and skips the qt6-multimedia check, which needs `pacman -Qq`).
function pathWithoutUwsm(home) {
  const dir = join(home, "path");
  mkdirSync(dir);
  for (const tool of ["bash", "env", "readlink", "dirname", "mktemp", "cmp", "cp", "chmod", "mkdir", "ln", "rm", "cat", "printf"]) {
    if (existsSync(join("/usr/bin", tool))) symlinkSync(join("/usr/bin", tool), join(dir, tool));
  }
  return dir;
}

// pathWithoutUwsm plus a stub `qs` (existence only, never run) and a stub
// `pacman -Qq <pkg>` that reports `installed` as present and everything
// else missing, so the requirements check is deterministic regardless of
// what is actually on this machine.
function pathWithStubs(home, { qs = false, installed = [] } = {}) {
  const dir = pathWithoutUwsm(home);
  if (qs) writeFileSync(join(dir, "qs"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const cases = installed.map(pkg => `    ${pkg}) exit 0 ;;`).join("\n");
  writeFileSync(
    join(dir, "pacman"),
    `#!/bin/sh\nif [ "$1" = "-Qq" ]; then\n  case "$2" in\n${cases}\n    *) exit 1 ;;\n  esac\nfi\nexit 1\n`,
    { mode: 0o755 },
  );
  return dir;
}

test("first run writes the desktop file and links the launcher; the second reports unchanged", () => {
  const home = scratchHome();
  try {
    const first = run(home);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /^desktop file: written /m);
    assert.match(first.out, /^launcher: linked /m);

    const second = run(home);
    assert.equal(second.code, 0, second.err);
    assert.match(second.out, /^desktop file: unchanged /m);
    assert.match(second.out, /^launcher: unchanged /m);
    assert.doesNotMatch(second.out, /written|linked /);

    const apps = readdirSync(join(home, ".local", "share", "applications")).filter(f => f.endsWith(".desktop"));
    assert.deepEqual(apps, ["Pacman.desktop"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the desktop file runs bin/pacman by full path with the bundled icon and no StartupWMClass", () => {
  const home = scratchHome();
  try {
    run(home);
    const text = readFileSync(desktopPath(home), "utf8");
    const lines = text.trimEnd().split("\n");
    assert.equal(lines[0], "[Desktop Entry]");
    assert.ok(lines.includes("Type=Application"));
    assert.ok(lines.includes("Name=Pacman"));
    assert.ok(lines.includes(`Exec="${LAUNCH}"`), "Exec is the checkout's bin/pacman, quoted");
    assert.ok(lines.includes(`Icon=${ICON}`));
    assert.ok(lines.includes("Terminal=false"));
    assert.ok(lines.some(l => l.startsWith("Categories=") && l.includes("Game;")));
    assert.ok(!lines.some(l => l.startsWith("StartupWMClass")));
    assert.ok(text.endsWith("\n"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the launcher is omarchy-pacman and nothing named pacman is created", () => {
  const home = scratchHome();
  try {
    run(home);
    const bin = join(home, ".local", "bin");
    assert.deepEqual(readdirSync(bin), ["omarchy-pacman"]);
    assert.ok(lstatSync(launcherPath(home)).isSymbolicLink());
    assert.equal(readlinkSync(launcherPath(home)), LAUNCH);
    assert.ok(!existsSync(join(bin, "pacman")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("without ~/.local/bin the launcher is skipped and the desktop file still lands", () => {
  const home = mkdtempSync(join(tmpdir(), "pacman-install-"));
  try {
    const result = run(home);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^launcher: skipped /m);
    assert.ok(existsSync(desktopPath(home)));
    assert.ok(!existsSync(join(home, ".local", "bin")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the printed menu snippet is JSON with the label, aliases and a uwsm-app action running this checkout's own bin/pacman; it is not applied anywhere", () => {
  const home = scratchHome();
  try {
    const result = run(home);
    const entry = snippet(result.out);
    assert.equal(entry.label, "Pacman");
    assert.deepEqual(entry.aliases, ["pacman", "game", "arcade"]);
    assert.equal(typeof entry.icon, "string");
    assert.ok(entry.icon.length > 0);
    // The real checkout path (ROOT), not the fixed plugin-path suggestion:
    // this test's checkout is not installed at ~/.config/omarchy/plugins/...,
    // so the action must reflect where it actually lives, quoted for a
    // path that may contain spaces (a development checkout's does).
    assert.equal(entry.action, `uwsm-app -- "${LAUNCH}"`);
    assert.match(result.out, /not applied/);
    assert.ok(!existsSync(join(home, ".config")), "nothing written under ~/.config");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("without uwsm-app the menu action is the bare quoted launcher path and says why", () => {
  const home = scratchHome();
  try {
    const result = run(home, [], { PATH: pathWithoutUwsm(home) });
    assert.equal(result.code, 0, result.err);
    const entry = snippet(result.out);
    assert.equal(entry.action, `"${LAUNCH}"`);
    assert.match(result.out, /uwsm-app is not on PATH/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the menu action collapses a $HOME-rooted checkout to a ~-relative path", () => {
  // A real (not scratch) $HOME set to this checkout's own parent directory,
  // so LAUNCH is genuinely $HOME-rooted; --dry-run touches nothing there.
  const home = dirname(ROOT);
  const xdg = mkdtempSync(join(tmpdir(), "pacman-install-xdg-"));
  try {
    const result = run(home, ["--dry-run"], { XDG_DATA_HOME: xdg });
    assert.equal(result.code, 0, result.err);
    const entry = snippet(result.out);
    const tail = LAUNCH.slice(home.length); // keeps the leading "/"
    assert.equal(entry.action, `uwsm-app -- "~${tail}"`);
  } finally {
    rmSync(xdg, { recursive: true, force: true });
  }
});

test("--dry-run prints what would happen and creates nothing", () => {
  const home = scratchHome();
  try {
    const result = run(home, ["--dry-run"]);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^desktop file: would write /m);
    assert.match(result.out, /^launcher: would link /m);
    assert.ok(!existsSync(join(home, ".local", "share")));
    assert.deepEqual(readdirSync(join(home, ".local", "bin")), []);
    snippet(result.out);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--uninstall removes the desktop file and the launcher, and is idempotent", () => {
  const home = scratchHome();
  try {
    run(home);
    assert.ok(existsSync(desktopPath(home)));
    assert.ok(existsSync(launcherPath(home)));

    const first = run(home, ["--uninstall"]);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /^desktop file: removed /m);
    assert.match(first.out, /^launcher: removed /m);
    assert.ok(!existsSync(desktopPath(home)));
    assert.ok(!existsSync(launcherPath(home)));

    const second = run(home, ["--uninstall"]);
    assert.equal(second.code, 0, second.err);
    assert.match(second.out, /^desktop file: absent$/m);
    assert.match(second.out, /^launcher: absent$/m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--dry-run --uninstall says what it would remove and removes nothing", () => {
  const home = scratchHome();
  try {
    run(home);
    const result = run(home, ["--dry-run", "--uninstall"]);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^desktop file: would remove /m);
    assert.match(result.out, /^launcher: would remove /m);
    assert.ok(existsSync(desktopPath(home)));
    assert.ok(existsSync(launcherPath(home)));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--uninstall leaves a desktop file whose Exec points elsewhere", () => {
  const home = scratchHome();
  try {
    const dir = join(home, ".local", "share", "applications");
    mkdirSync(dir, { recursive: true });
    const foreign = "[Desktop Entry]\nType=Application\nName=Pacman\nExec=/opt/other/bin/pacman\n";
    writeFileSync(desktopPath(home), foreign);
    const result = run(home, ["--uninstall"]);
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^desktop file: not ours, left alone /m);
    assert.equal(readFileSync(desktopPath(home), "utf8"), foreign);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--uninstall leaves an omarchy-pacman that is not our symlink", () => {
  const home = scratchHome();
  try {
    symlinkSync("/opt/other/bin/pacman", launcherPath(home));
    const linked = run(home, ["--uninstall"]);
    assert.equal(linked.code, 0, linked.err);
    assert.match(linked.out, /^launcher: not ours, left alone /m);
    assert.equal(readlinkSync(launcherPath(home)), "/opt/other/bin/pacman");

    rmSync(launcherPath(home));
    writeFileSync(launcherPath(home), "#!/bin/sh\nexit 0\n");
    const plain = run(home, ["--uninstall"]);
    assert.equal(plain.code, 0, plain.err);
    assert.match(plain.out, /^launcher: not ours, left alone /m);
    assert.ok(lstatSync(launcherPath(home)).isFile());
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("refuses to proceed when a pacman on PATH resolves into the checkout", () => {
  const home = scratchHome();
  try {
    const dir = pathWithoutUwsm(home);
    symlinkSync(LAUNCH, join(dir, "pacman"));
    const result = run(home, [], { PATH: dir });
    assert.notEqual(result.code, 0);
    assert.match(result.err, /shadows the Arch package manager/);
    assert.ok(!existsSync(desktopPath(home)));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("requirements: reports quickshell and qt6-multimedia missing, and does not fail the install", () => {
  const home = scratchHome();
  try {
    const dir = pathWithStubs(home, { qs: false, installed: [] });
    const result = run(home, [], { PATH: dir });
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^requirements: missing quickshell qt6-multimedia — install with: sudo pacman -S quickshell qt6-multimedia$/m);
    assert.match(result.out, /^desktop file: written /m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("requirements: says nothing when quickshell and qt6-multimedia are both present", () => {
  const home = scratchHome();
  try {
    const dir = pathWithStubs(home, { qs: true, installed: ["qt6-multimedia"] });
    const result = run(home, [], { PATH: dir });
    assert.equal(result.code, 0, result.err);
    assert.doesNotMatch(result.out, /requirements: missing/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("requirements: lists only the one missing package", () => {
  const home = scratchHome();
  try {
    const dir = pathWithStubs(home, { qs: true, installed: [] });
    const result = run(home, [], { PATH: dir });
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /^requirements: missing qt6-multimedia — install with: sudo pacman -S qt6-multimedia$/m);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("an unknown option fails with usage", () => {
  const home = scratchHome();
  try {
    const result = run(home, ["--bogus"]);
    assert.equal(result.code, 2);
    assert.match(result.err, /unknown option/);
    assert.match(result.err, /usage: bin\/install/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
