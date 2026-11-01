const assert = require('assert')
const fs = require('fs')
const path = require('path')
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript')
const root = path.resolve(__dirname, '..')
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
assert.equal(parsed.errors.length, 0, 'Invalid TypeScript configuration')
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true })
const diagnostics = ts.getPreEmitDiagnostics(program)
assert.equal(diagnostics.length, 0, diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'))
let checked = 0
for (const file of parsed.fileNames.filter(file => file.includes('/miniprogram/') && !file.endsWith('.d.ts'))) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: parsed.options }).outputText
  const source = ts.createSourceFile(file + '.js', output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const unsupported = []
  function visit(node) {
    if (node.questionDotToken || node.kind === ts.SyntaxKind.QuestionQuestionToken || ts.isSpreadAssignment(node)) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source))
      unsupported.push(`${position.line + 1}:${position.character + 1} ${node.getText(source)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(unsupported.length, 0, `${path.relative(root, file)} emits unsupported device syntax:\n${unsupported.join('\n')}`)
  checked++
}
const settings = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')).setting
assert.equal(settings.es6, true, 'Enable ES6 compilation for authored JavaScript files')
assert.equal(settings.enhance, true, 'Enable enhanced compilation for authored JavaScript files')
console.log(`PASS: TypeScript strict checks and device syntax checks (${checked} source files); JavaScript compilation enabled`)
