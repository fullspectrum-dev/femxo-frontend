import ts from "typescript";

/** Attributes whose text a person reads (or hears), so they belong in the message catalogue too. */
const READABLE_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt", "label", "message", "description", "hint", "legend"]);

export interface Literal {
  line: number;
  text: string;
}

/** Names that are the same in every language. */
const NAMES = new Set(["Femxo", "Prime", "UPI"]);

const hasLetters = (text: string) => /\p{L}{2,}/u.test(text) && !NAMES.has(text.trim());

/**
 * The human-readable English written straight into a component: text between
 * JSX tags, and readable attributes given as plain strings. Anything that
 * goes through `t()` (a call, not a literal) is fine, and so are class
 * names, hrefs and other non-text attributes.
 */
export function findLiterals(source: string, fileName = "file.tsx"): Literal[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Literal[] = [];
  const at = (node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, " ").trim();
      if (text && hasLetters(text)) found.push({ line: at(node), text });
    } else if (ts.isJsxAttribute(node) && node.initializer && READABLE_ATTRIBUTES.has(node.name.getText())) {
      const value = node.initializer;
      if (ts.isStringLiteral(value) && hasLetters(value.text)) found.push({ line: at(node), text: value.text });
      else if (ts.isJsxExpression(value) && value.expression && (ts.isStringLiteral(value.expression) || ts.isNoSubstitutionTemplateLiteral(value.expression)) && hasLetters(value.expression.text)) {
        found.push({ line: at(node), text: value.expression.text });
      } else if (ts.isJsxExpression(value) && value.expression && ts.isTemplateExpression(value.expression)) {
        found.push({ line: at(node), text: value.expression.getText() });
      }
    } else if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression) && node.parent && !ts.isJsxAttribute(node.parent) && hasLetters(node.expression.text)) {
      found.push({ line: at(node), text: node.expression.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
