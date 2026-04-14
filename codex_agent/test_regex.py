import re
STRING_RE = re.compile(r'(["\'\`])((?:\\.|(?!\1).)*)\1')
text = """
export default function App() {
  const status = "active";
  return (
    <div className="container">
      <h1>한국어 테스트</h1>
      <button onClick={() => alert('버튼 클릭')}>클릭</button>
    </div>
  );
}
"""
for line in text.splitlines():
    for match in STRING_RE.finditer(line):
        print("Found:", match.group(2))
