export function SearchHelp() {
  return (
    <details className="search-help">
      <summary aria-label="Search help" title="Search help">?</summary>
      <div className="help-panel">
        <h2>Search help</h2>
        <dl><div><dt>John 3:16</dt><dd>A verse</dd></div><div><dt>John 3</dt><dd>A chapter</dd></div><div><dt>love mercy</dt><dd>Words to find</dd></div></dl>
        <p>In Advanced, <code>+</code> means both, <code>,</code> means either. Use parentheses to group words.</p>
        <span><kbd>/</kbd> Search <kbd>Esc</kbd> Close reader</span>
      </div>
    </details>
  );
}
