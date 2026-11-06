"""Generated permission compatibility and safe frontmatter diagnostics."""

from pathlib import Path
import tempfile
import unittest

from evaluation_runner import _assert_markdown_agents


def installed_agent_text(name):
    """Reproduce the installer's permission insertion using public templates."""
    repo = Path(__file__).resolve().parents[2]
    block = ["permission:"]
    capturing = False
    for line in (repo / "base/opencode/permissions/agents.yml").read_text().splitlines():
        if line == f"  {name}:":
            capturing = True
            continue
        if not capturing or not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith("    "):
            break
        block.append(line[2:])
    if len(block) == 1:
        raise AssertionError("Missing public agent permission fixture")
    lines = (repo / "base/opencode/agents" / f"{name}.md").read_text().splitlines()
    index = next(i for i, line in enumerate(lines) if line.startswith("description:")) + 1
    lines[index:index] = block
    return "\n".join(lines) + "\n"


class MarkdownDiagnosticTests(unittest.TestCase):
    def test_rejections_identify_location_and_category_without_private_content(self):
        cases = [
            ("\ufeff---\nmode: subagent\n---", 1, "noncanonical_document_start"),
            ("---\nprivate-content\n---", 2, "unsupported_field_syntax"),
            ("---\nmodel: private-content\n---", 2, "explicit_model_override"),
            ("---\n'private-content': secret\n---", 2, "unknown_field_or_key_encoding"),
            ("---\n'model': private-content\n---", 2, "unknown_field_or_key_encoding"),
            ("---\nmode: subagent\nmode: private-content\n---", 3, "duplicate_field"),
            ("---\ndescription: private-content: secret\n---", 2, "unsupported_value_syntax"),
            ("---\nmode: subagent", 3, "missing_document_end"),
        ]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            agents = root / ".opencode/agents"
            agents.mkdir(parents=True)
            path = agents / "code.md"
            for content, line, reason in cases:
                with self.subTest(reason=reason):
                    path.write_text(content)
                    with self.assertRaises(ValueError) as caught:
                        _assert_markdown_agents(root)
                    message = str(caught.exception)
                    self.assertEqual(message, f"Unsupported markdown agent frontmatter: code.md:{line} ({reason})")
                    self.assertNotIn("private-content", message)
                    self.assertNotIn(str(root), message)

    def test_every_public_agent_with_installer_permissions_is_accepted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            agents = root / ".opencode/agents"
            agents.mkdir(parents=True)
            for name in ("code", "delivery", "planner", "research", "reviewer", "architect", "troubleshooter"):
                content = installed_agent_text(name)
                self.assertEqual(content.splitlines()[2], "permission:")
                (agents / f"{name}.md").write_text(content)
            _assert_markdown_agents(root)

    def test_permission_support_does_not_allow_model_or_yaml_bypasses(self):
        bad_blocks = [
            "permission:\n  model: openai/paid",
            "permission:\n  bash:\n    model: openai/paid",
            "permission:\n  task: &alias deny",
            "permission:\n  <<: *alias",
            'permission:\n  bash:\n    "\\\\u006dodel": allow',
            "permission:\n\tmodel: openai/paid",
            "permission:\n  read: allow\nmodel: openai/paid",
            "permission:\n  read: allow\n'model': openai/paid",
            "permission:\n  read: allow\n  read: deny",
            'permission:\n  bash:\n    "*": allow\n    "*": deny',
            "permission:\n  task:\n    code: allow\n    code: deny",
            "permission:\n  read:",
            "permission:\n  bash:\n  task: deny",
            "permission:",
            "permission:\n  task: deny\npermission:\n  read: allow",
        ]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            agents = root / ".opencode/agents"
            agents.mkdir(parents=True)
            for block in bad_blocks:
                with self.subTest(block=block):
                    (agents / "code.md").write_text("---\ndescription: Test agent.\n" + block + "\nmode: subagent\n---\n")
                    with self.assertRaises(ValueError):
                        _assert_markdown_agents(root)

    def test_nonstandard_filename_is_not_echoed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            agents = root / ".opencode/agents"
            agents.mkdir(parents=True)
            (agents / "private\ncontent.md").write_text("---\nmodel: secret\n---")
            with self.assertRaisesRegex(ValueError, r"<nonstandard-filename>:2 \(explicit_model_override\)") as caught:
                _assert_markdown_agents(root)
            self.assertNotIn("private", str(caught.exception))
            self.assertNotIn("secret", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
