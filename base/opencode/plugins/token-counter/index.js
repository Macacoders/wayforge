import { tool } from "@opencode-ai/plugin/tool";
import { encode } from "gpt-tokenizer";
import fs from "node:fs";
import path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".txt",
  ".sh",
  ".ps1",
]);

const SKIP_DIRS = new Set(["node_modules", ".git"]);

function isSupportedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function shouldSkip(filePath) {
  return filePath
    .split(path.sep)
    .some((part) => SKIP_DIRS.has(part));
}

function resolvePatterns(paths, baseDir) {
  const patterns = [];

  for (const rawPath of paths) {
    const resolved = path.resolve(baseDir, rawPath);

    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        patterns.push(path.join(resolved, "**", "*"));
      } else {
        patterns.push(resolved);
      }
    } catch {
      // Treat as a glob pattern if stat fails.
      patterns.push(resolved);
    }
  }

  return patterns;
}

function collectFiles(patterns) {
  const files = new Set();

  for (const pattern of patterns) {
    for (const match of fs.globSync(pattern, { withFileTypes: false })) {
      const normalized = path.normalize(match);
      if (fs.statSync(normalized).isFile() && !shouldSkip(normalized)) {
        files.add(normalized);
      }
    }
  }

  return [...files].sort();
}

function formatResults(results, total, fileCount, encoding) {
  const fileHeader = "File";
  const tokenHeader = "Tokens";
  const fileWidth = Math.max(
    fileHeader.length,
    ...results.map(([file]) => file.length),
  );

  const lines = [
    `${fileHeader.padEnd(fileWidth)}  ${tokenHeader}`,
    "-".repeat(fileWidth + 2 + Math.max(tokenHeader.length, 6)),
  ];

  for (const [file, count] of results) {
    lines.push(`${file.padEnd(fileWidth)}  ${count.toLocaleString()}`);
  }

  lines.push("-".repeat(fileWidth + 2 + Math.max(tokenHeader.length, 6)));
  lines.push(
    `${`Total (${fileCount} files):`.padEnd(fileWidth)}  ${total.toLocaleString()}`,
  );
  lines.push(`Encoding: ${encoding}`);

  return lines.join("\n");
}

export async function server(input) {
  return {
    tool: {
      count_tokens: tool({
        description:
          "Count tokens in AI configuration files using cl100k_base encoding. Scans Markdown, JSON/JSONC, YAML, and text files.",
        args: {
          paths: tool.schema
            .array(tool.schema.string())
            .describe("File globs or directory paths to scan"),
          encoding: tool.schema
            .string()
            .optional()
            .default("cl100k_base")
            .describe("Tokenizer encoding (default: cl100k_base)"),
        },
        async execute(args, ctx) {
          const baseDir = ctx.directory ?? process.cwd();
          const encoding = args.encoding ?? "cl100k_base";

          const patterns = resolvePatterns(args.paths, baseDir);
          const allFiles = collectFiles(patterns);
          const files = allFiles.filter(isSupportedFile);

          const results = [];
          let total = 0;

          for (const file of files) {
            const content = fs.readFileSync(file, "utf-8");
            const tokens = encode(content);
            const count = tokens.length;
            total += count;
            results.push([path.relative(baseDir, file), count]);
          }

          return formatResults(results, total, results.length, encoding);
        },
      }),
    },
  };
}
