/**
 * `floop completion <bash|zsh|fish|powershell>` — emit a shell completion
 * script for the requested shell. Users install via:
 *
 *   bash:        echo 'eval "$(floop completion bash)"' >> ~/.bashrc
 *   zsh:         floop completion zsh > ~/.zsh/completions/_floop
 *   fish:        floop completion fish > ~/.config/fish/completions/floop.fish
 *   PowerShell:  floop completion powershell | Out-String | Invoke-Expression
 *
 * The command tree is hand-maintained here as a data structure so adding a
 * new command updates all four shell outputs in one place. Dynamic
 * completion of project names (via a `floop list --json` cache) is a
 * follow-on — for now we complete the static command/subcommand/option
 * surface, which is what users hit 90% of the time.
 */

interface CompletionLeaf {
  /** Long-form options accepted by the command, including flag values. */
  opts?: string[];
  /** Aliases (alternate command names). */
  aliases?: string[];
}

interface CompletionParent extends CompletionLeaf {
  sub?: Record<string, CompletionLeaf>;
}

const TREE: Record<string, CompletionParent> = {
  login: { opts: ["--device", "--json"] },
  logout: { opts: ["--json"] },
  whoami: { opts: ["--json"] },
  new: { opts: ["--name", "--subdomain", "--bot-type", "--team", "--no-wait", "--json"] },
  list: { opts: ["--team", "--json"], aliases: ["ls"] },
  status: { opts: ["--watch", "--json"] },
  cancel: { opts: ["--json"] },
  reactivate: { opts: ["--json"] },
  open: { opts: ["--json"] },
  chat: {},
  upgrade: { opts: ["--check", "--json"] },
  docs: { opts: ["--json"] },
  feedback: { opts: ["--json"] },
  usage: { opts: ["--json"] },
  conversations: { opts: ["--limit", "--json"], aliases: ["history"] },
  secrets: {
    sub: {
      list: { opts: ["--json"], aliases: ["ls"] },
      set: { opts: ["--value", "--from-env", "--json"] },
      rm: { opts: ["--json"], aliases: ["delete"] },
    },
  },
  keys: {
    sub: {
      list: { opts: ["--json"], aliases: ["ls"] },
      create: { opts: ["--json"] },
      rm: { opts: ["--json"], aliases: ["delete"] },
    },
  },
  library: {
    sub: {
      list: { opts: ["--bot-type", "--search", "--sort", "--limit", "--json"], aliases: ["ls"] },
      clone: { opts: ["--subdomain", "--json"] },
    },
  },
  subdomain: {
    sub: {
      check: { opts: ["--json"] },
      suggest: { opts: ["--json"] },
    },
  },
  completion: {},
};

const TOP_LEVEL_NAMES = Object.entries(TREE).flatMap(([name, node]) => [
  name,
  ...(node.aliases ?? []),
]);

const GLOBAL_OPTS = ["--help", "-h", "--version", "-V"];

// ─── Bash ──────────────────────────────────────────────────────────────────

function bashScript(): string {
  const top = [...TOP_LEVEL_NAMES, "help"].join(" ");
  const subCases = Object.entries(TREE)
    .filter(([, n]) => n.sub)
    .map(([name, n]) => {
      const subs = Object.entries(n.sub!).flatMap(([s, ls]) => [s, ...(ls.aliases ?? [])]);
      return `    ${name})\n      if [ "$prev" = "${name}" ]; then\n        COMPREPLY=( $(compgen -W "${subs.join(" ")}" -- "$cur") )\n      fi\n      ;;`;
    })
    .join("\n");

  const optCases = Object.entries(TREE)
    .filter(([, n]) => n.opts && n.opts.length > 0 && !n.sub)
    .map(([name, n]) => `    ${name})\n      COMPREPLY=( $(compgen -W "${[...(n.opts ?? []), ...GLOBAL_OPTS].join(" ")}" -- "$cur") )\n      ;;`)
    .join("\n");

  return `# floop bash completion — install with:
#   echo 'source <(floop completion bash)' >> ~/.bashrc
_floop() {
  local cur prev cmd
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${top}" -- "$cur") )
    return 0
  fi

  case "$cmd" in
${subCases}
${optCases}
  esac
}
complete -F _floop floop
`;
}

// ─── Zsh ───────────────────────────────────────────────────────────────────

function zshScript(): string {
  const topDescriptions = Object.entries(TREE).map(
    ([name]) => `    '${name}:floop ${name}'`,
  ).join("\n");

  const subBlocks = Object.entries(TREE)
    .filter(([, n]) => n.sub)
    .map(([name, n]) => {
      const subs = Object.entries(n.sub!).map(([s]) => `        '${s}:${name} ${s}'`).join("\n");
      return `    ${name})\n      _values 'subcommand' \\\n${subs}\n      ;;`;
    })
    .join("\n");

  return `#compdef floop
# floop zsh completion — save to a directory on $fpath, e.g.:
#   floop completion zsh > "\${fpath[1]}/_floop"
# Then in ~/.zshrc: autoload -U compinit && compinit

_floop() {
  local context state line

  _arguments -C \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      _values 'command' \\
${topDescriptions}
      ;;
    args)
      case $words[2] in
${subBlocks}
      esac
      ;;
  esac
}

_floop "$@"
`;
}

// ─── Fish ──────────────────────────────────────────────────────────────────

function fishScript(): string {
  const top = Object.entries(TREE).map(
    ([name]) => `complete -c floop -n "__fish_use_subcommand" -a "${name}" -d "floop ${name}"`,
  ).join("\n");

  const sub = Object.entries(TREE)
    .filter(([, n]) => n.sub)
    .flatMap(([name, n]) =>
      Object.entries(n.sub!).map(([s]) =>
        `complete -c floop -n "__fish_seen_subcommand_from ${name}" -a "${s}" -d "${name} ${s}"`,
      ),
    )
    .join("\n");

  return `# floop fish completion — save to ~/.config/fish/completions/floop.fish
${top}

${sub}
`;
}

// ─── PowerShell ────────────────────────────────────────────────────────────

function powershellScript(): string {
  // PowerShell uses Register-ArgumentCompleter. We list top-level commands
  // and per-command subcommands; flag completion is left to user typing.
  const subMapping = Object.entries(TREE)
    .filter(([, n]) => n.sub)
    .map(([name, n]) => {
      const subs = Object.keys(n.sub!).map((s) => `'${s}'`).join(", ");
      return `    '${name}' = @(${subs})`;
    })
    .join("\n");

  const top = Object.keys(TREE).map((n) => `'${n}'`).join(", ");

  return `# floop PowerShell completion — install with:
#   floop completion powershell | Out-String | Invoke-Expression
# To persist: append the printed script to your $PROFILE.

$_floopCommands = @(${top})
$_floopSubcommands = @{
${subMapping}
}

Register-ArgumentCompleter -Native -CommandName floop -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $tokens = $commandAst.CommandElements
  $tokenCount = $tokens.Count

  if ($tokenCount -le 2) {
    $_floopCommands |
      Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    return
  }

  $cmd = $tokens[1].Value
  if ($_floopSubcommands.ContainsKey($cmd)) {
    $_floopSubcommands[$cmd] |
      Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', "$cmd $_") }
  }
}
`;
}

// ─── Command ───────────────────────────────────────────────────────────────

const SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
type Shell = (typeof SHELLS)[number];

export function completionCommand(shell: string): void {
  const s = shell.toLowerCase() as Shell;
  if (!SHELLS.includes(s)) {
    console.error(`Unknown shell: ${shell}. Choose one of: ${SHELLS.join(", ")}`);
    process.exit(1);
  }

  switch (s) {
    case "bash":
      process.stdout.write(bashScript());
      break;
    case "zsh":
      process.stdout.write(zshScript());
      break;
    case "fish":
      process.stdout.write(fishScript());
      break;
    case "powershell":
      process.stdout.write(powershellScript());
      break;
  }
}
