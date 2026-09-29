import { useState, useEffect } from 'react';
import { Sidebar, type Screen } from './components/Sidebar';
import { FlowPanel } from './components/FlowPanel';
import { Today } from './screens/Today';
import { FocusMode } from './screens/FocusMode';
import { Campaigns } from './screens/Campaigns';
import { LeadGeneration } from './screens/LeadGeneration';
import { Replies } from './screens/Replies';
import { Deals } from './screens/Deals';
import { Team } from './screens/Team';
import { Settings } from './screens/Settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('today');
  const [flowOpen, setFlowOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inSession, setInSession] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setFlowOpen(o => !o);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // When entering Focus mode, detect the session started state from child
  function handleNavigate(s: Screen) {
    if (s !== 'focus') setInSession(false);
    setScreen(s);
  }

  const showSidebar = !inSession;
  const showFlow = !inSession && flowOpen;

  return (
    <div className="flex h-screen bg-[#050807] overflow-hidden">
      {showSidebar && (
        <Sidebar
          active={screen}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
        />
      )}

      <main className="flex-1 flex overflow-hidden min-w-0">
        {screen === 'today' && (
          <Today
            onStartFocus={() => handleNavigate('focus')}
            onReplies={() => handleNavigate('replies')}
          />
        )}
        {screen === 'focus' && (
          <FocusMode
            onEnd={() => { setInSession(false); handleNavigate('today'); }}
            onSessionStart={() => setInSession(true)}
            onSessionEnd={() => setInSession(false)}
            onFlowToggle={() => setFlowOpen(o => !o)}
            flowVisible={flowOpen}
          />
        )}
        {screen === 'campaigns' && <Campaigns />}
        {screen === 'lead-gen' && <LeadGeneration />}
        {screen === 'replies' && <Replies />}
        {screen === 'deals' && <Deals />}
        {screen === 'team' && <Team />}
        {screen === 'settings' && <Settings />}
      </main>

      {showFlow && (
        <FlowPanel
          screen={screen}
          collapsed={false}
          onToggle={() => setFlowOpen(false)}
        />
      )}
      {!showFlow && !inSession && (
        <button
          onClick={() => setFlowOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-2 py-4 px-2 bg-[#0B1210] border border-[#1D2925] border-r-0 rounded-l-xl cursor-pointer hover:border-[#34E0A1]/40 transition-colors"
          title="Open Flow (press /)"
        >
          <span className="text-[10px] text-[#B8C9C2] font-mono tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>FLOW</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
            <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
            <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
