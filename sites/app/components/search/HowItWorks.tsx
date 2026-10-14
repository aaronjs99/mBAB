import type { SearchExample, SearchMode } from "@/app/search/types";

type Props = {
  firstExample: SearchExample;
  onExample: (example: SearchExample) => void;
  onChooseBooks: () => void;
  onReturnToSearch: (mode?: SearchMode) => void;
};

export function HowItWorks({ firstExample, onExample, onChooseBooks, onReturnToSearch }: Props) {
  return (
    <section className="how-section" id="how-it-works" aria-labelledby="how-heading">
      <div className="section-heading">
        <div><p className="eyebrow">How mBAB works</p><h2 id="how-heading">A better question leads<br />to a clearer thread.</h2></div>
        <p className="section-intro">Start simple, then shape the search until it matches the way you are reading.</p>
      </div>
      <div className="feature-grid">
        <article>
          <span className="feature-index">01</span>
          <h3>Start with an idea</h3>
          <p>Enter a word, a phrase, or two ideas you want to see together in the same verse.</p>
          <button className="how-action" type="button" onClick={() => onExample(firstExample)}>Try “love + mercy” <span aria-hidden="true">→</span></button>
        </article>
        <article>
          <span className="feature-index">02</span>
          <h3>Shape the logic</h3>
          <p>Use every word, any word, or a grouped expression. Then choose an edition and the exact books to search.</p>
          <div className="logic-preview" aria-label="Available search modes"><span>ALL</span><span>ANY</span><span>ADVANCED</span></div>
          <button className="how-action" type="button" onClick={onChooseBooks}>Choose books <span aria-hidden="true">→</span></button>
        </article>
        <article>
          <span className="feature-index">03</span>
          <h3>Follow what you find</h3>
          <p>Matches are highlighted and explained. Save meaningful verses on your device or share the complete search.</p>
          <div className="mini-result"><strong>Romans 5:1</strong><span>…being justified by faith…</span></div>
          <button className="how-action" type="button" onClick={() => onReturnToSearch("advanced")}>Build an advanced search <span aria-hidden="true">→</span></button>
        </article>
      </div>
    </section>
  );
}
