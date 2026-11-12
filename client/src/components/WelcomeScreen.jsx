import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { supportTopics } from '../config';
import SupportIcon from './SupportIcon';

export default function WelcomeScreen({ onQuestion, pending }) {
  return <section className="welcome" aria-labelledby="welcome-heading">
    <div className="welcome-mark"><SupportIcon size={27} /></div>
    <p className="eyebrow">A LITTLE HELP, RIGHT HERE</p>
    <h1 id="welcome-heading">How can we help you?</h1>
    <p className="welcome-description">From your first order to your next return.<br />Ask us about shopping with ShopSphere.</p>
    <div className="suggestions">{supportTopics.map((topic) => <button key={topic.id} onClick={() => onQuestion(topic.question)} disabled={pending} aria-label={`Ask about ${topic.title.toLowerCase()}`}>
      <SupportIcon type={topic.icon} /><span><strong>{topic.title}</strong><span>{topic.description}</span></span><ArrowUpRight size={16} className="suggestion-arrow" />
    </button>)}</div>
    <p className="welcome-note"><ShieldCheck size={15} aria-hidden="true" />Answers based on ShopSphere’s support policies.</p>
  </section>;
}
