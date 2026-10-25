#!/usr/bin/env bash
# The Jarvis 4 runtime bundle of this fork (DE0CH/deepseek-harness): an official Node build plus dsh installed by npm
# from this checkout's own release tarballs (the same pack and install as upstream's release.yml and
# release:verify-packed-install), so the session runs exactly what an `npx @deepseek-ai/dsh` user would, at this commit.
#
#   de0ch/runtime-bundle.sh OUT_DIR    -> OUT_DIR/dsh-runtime-linux-x64.tar.gz   (node/, app/: app/node_modules/.bin/dsh)
#
# Needs: pnpm install done in this checkout, network for npm's external dependencies and the Node download.
set -euo pipefail
OUT="$(realpath "$1")"
NODE_VERSION="${NODE_VERSION:-24.22.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$ROOT"

pnpm run build:official
pnpm run release:pack --family dsh --out "$WORK/npm" --concurrency 8
pnpm run release:pack --family vendor --out "$WORK/npm-vendor" --concurrency 8
pnpm --dir native/system run build:ts
pnpm --dir native/system/packages/entry pack --pack-destination "$WORK/npm-landlock"

B="$WORK/bundle"; mkdir -p "$B/app"
python3 - "$B/app/package.json" "$WORK"/npm "$WORK"/npm-vendor "$WORK"/npm-landlock <<'PY'
import glob, json, os, sys, tarfile
out, dirs = sys.argv[1], sys.argv[2:]
def fits(rule, value):  # npm's os/cpu rule: allow-list, or "!x" deny entries
    if not rule: return True
    allow = [r for r in rule if not r.startswith("!")]
    return value not in [r[1:] for r in rule if r.startswith("!")] and (not allow or value in allow)
deps = {}
for d in dirs:
    for t in sorted(glob.glob(os.path.join(d, "*.tgz"))):
        with tarfile.open(t) as tf:
            pkg = json.load(tf.extractfile("package/package.json"))
        # foreign-platform builds (darwin, win32, arm64) stay out, as in upstream's release:verify-packed-install
        if fits(pkg.get("os"), "linux") and fits(pkg.get("cpu"), "x64"):
            deps[pkg["name"]] = "file:" + t
json.dump({"name": "dsh-jarvis4-runtime", "version": "0.0.0", "private": True, "dependencies": deps}, open(out, "w"), indent=1)
PY
# --install-links copies the tarballs' contents (no links back into $WORK); optional = foreign-platform builds
( cd "$B/app" && npm install --install-links --no-audit --no-fund --package-lock=false --omit=optional --omit=dev )
"$B/app/node_modules/.bin/dsh" --version

curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" -o "$WORK/node.tar.xz"
mkdir -p "$B/node" && tar -xJf "$WORK/node.tar.xz" -C "$B/node" --strip-components=1
rm -rf "$B/node/include" "$B/node/share" "$B/node/lib/node_modules/npm" "$B/node/lib/node_modules/corepack" "$B/node/bin/npm" "$B/node/bin/npx" "$B/node/bin/corepack"
# drop the tarball paths from the manifest: they point into $WORK
python3 -c "import json,sys;p=sys.argv[1];d=json.load(open(p));d['dependencies']={k:'*' for k in d['dependencies']};json.dump(d,open(p,'w'),indent=1)" "$B/app/package.json"
mkdir -p "$OUT"
tar -czf "$OUT/dsh-runtime-linux-x64.tar.gz" -C "$B" node app
ls -l "$OUT/dsh-runtime-linux-x64.tar.gz"
