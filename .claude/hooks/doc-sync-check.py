#!/usr/bin/env python3
# Claude Code PreToolUse 钩子（matcher: Bash）—— 提交前文档同步检查
#
# 规则：本次 git commit 将纳入的改动里，若含「Worker / 前端代码」却无任何「文档」
# 改动，则阻止提交（exit 2，提示反馈给 Claude），要求补文档；确需跳过时在提交
# 信息里加标记 [skip-doc-check]。
#
# 健壮性：任何内部异常一律放行（exit 0, fail-open）—— 钩子自身绝不能挡住正常工作。
# 判定来源：已暂存文件 + 命令内联的 `git add` 目标 + `git commit -a` 的已改跟踪文件。
import sys, json, subprocess, re, shlex

CODE = re.compile(r'^(src/|web/|schema\.sql|wrangler\.(toml|jsonc|json))')
DOCS = re.compile(r'^(docs/|README\.md|(\.claude/)?CLAUDE\.md)')


def git(*args):
    try:
        return subprocess.run(["git", *args], capture_output=True,
                              text=True, timeout=10).stdout
    except Exception:
        return ""


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        return 0
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if "git commit" not in cmd:
        return 0                       # 非提交命令，放行
    if "[skip-doc-check]" in cmd:
        return 0                       # 显式跳过

    files = set()
    # 1) 已暂存（分开 add 再 commit）
    for ln in git("diff", "--cached", "--name-only").splitlines():
        if ln.strip():
            files.add(ln.strip())
    # 2) 命令里内联的 `git add ...`（add 与 commit 合并为一条命令）
    if "git add" in cmd:
        for seg in re.split(r'&&|\|\||;|\n', cmd):
            idx = seg.find("git add")
            if idx < 0:
                continue
            try:
                toks = shlex.split(seg[idx:])[2:]      # 去掉 'git' 'add'
            except Exception:
                continue
            if any(t in (".", "-A", "--all", "-Av", ":/") for t in toks):
                for ln in git("status", "--porcelain").splitlines():
                    p = ln[3:].strip()
                    if p:
                        files.add(p)
            else:
                for t in toks:
                    if not t.startswith("-"):
                        files.add(t)
    # 3) git commit -a / -am / --all
    if (" --all" in cmd) or re.search(r'commit[^\n;&|]*\s-[A-Za-z]*a[A-Za-z]*\b', cmd):
        for ln in git("diff", "--name-only").splitlines():
            if ln.strip():
                files.add(ln.strip())

    code = sorted(f for f in files if CODE.match(f))
    docs = sorted(f for f in files if DOCS.match(f))
    if code and not docs:
        sys.stderr.write(
            "⛔ 文档同步检查未通过：本次提交改了 Worker/前端代码但没有任何文档改动。\n"
            "改动的代码：\n  " + "\n  ".join(code) + "\n\n"
            "请对照 .claude/CLAUDE.md 的「代码 → 文档对照表」补齐 docs/ 或 README 后再提交。\n"
            "若本次确实无需文档（如纯重构 / 修 typo），在提交信息里加标记 [skip-doc-check] 即可跳过。\n"
        )
        return 2                       # 阻止提交，stderr 反馈给 Claude
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)                    # fail-open
