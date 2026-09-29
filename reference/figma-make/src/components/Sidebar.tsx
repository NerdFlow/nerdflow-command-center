import { loggedReplies, currentUser } from '../data/sample';

export type Screen = 'today' | 'focus' | 'replies' | 'campaigns' | 'lead-gen' | 'deals' | 'team' | 'settings';

interface SidebarProps {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const openReplies = loggedReplies.filter(r => r.status === 'open');
const hasRed = openReplies.some(r => (Date.now() - r.receivedAt.getTime()) > 86400000);
const replyBadgeColor = hasRed ? '#F87171' : '#34E0A1';

const navItems: { id: Screen; label: string; icon: React.FC; badge?: number; badgeColor?: string }[] = [
  { id: 'today',    label: 'Today',      icon: SunIcon },
  { id: 'focus',    label: 'Focus',      icon: ZapIcon,     badge: 12,               badgeColor: '#34E0A1' },
  { id: 'replies',  label: 'Replies',    icon: MessageIcon, badge: openReplies.length, badgeColor: replyBadgeColor },
  { id: 'campaigns',label: 'Campaigns',  icon: FlagIcon },
  { id: 'lead-gen', label: 'Lead Gen',   icon: SearchIcon,  badge: 1,                badgeColor: '#34E0A1' },
  { id: 'deals',    label: 'Deals',      icon: TrendingIcon },
  { id: 'team',     label: 'Team',       icon: UsersIcon },
  { id: 'settings', label: 'Settings',   icon: SettingsIcon },
];

export function Sidebar({ active, onNavigate, collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={`shrink-0 flex flex-col bg-[#0B1210] border-r border-[#1D2925] h-full transition-all duration-200 ${collapsed ? 'w-14' : 'w-44'}`}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-[#1D2925]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 shrink-0 rounded-lg bg-[#34E0A1]/10 border border-[#34E0A1]/30 flex items-center justify-center">
            <GlassesLogoIcon />
          </div>
          {!collapsed && <span className="text-sm font-bold text-white tracking-tight">NerdFlow</span>}
        </div>
        <button
          onClick={onToggle}
          className="text-[#6B7E78] hover:text-[#B8C9C2] transition-colors ml-1"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col py-3 gap-0.5 px-2">
        {navItems.map(({ id, label, icon: Icon, badge, badgeColor }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={collapsed ? label : undefined}
            className={`relative flex items-center gap-3 rounded-xl transition-all group ${
              collapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-3 py-2.5'
            } ${
              active === id
                ? 'bg-[#34E0A1]/10 text-[#34E0A1]'
                : 'text-[#6B7E78] hover:text-[#B8C9C2] hover:bg-[#121A17]'
            }`}
          >
            <span className="shrink-0">
              <Icon />
            </span>
            {!collapsed && (
              <span className={`text-sm font-medium ${active === id ? 'text-[#34E0A1]' : ''}`}>{label}</span>
            )}
            {badge !== undefined && badge > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 text-[#050807] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5"
                style={{ background: badgeColor ?? '#34E0A1' }}
              >
                {badge}
              </span>
            )}
            {/* Tooltip only when collapsed */}
            {collapsed && (
              <span className="absolute left-full ml-3 px-2 py-1 bg-[#121A17] border border-[#1D2925] rounded-md text-xs text-white whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                {label}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className={`flex flex-col items-center gap-3 py-3 border-t border-[#1D2925] ${collapsed ? '' : 'px-3'}`}>
        <div className="flex items-center gap-1.5" title={`${currentUser.streak}-day streak`}>
          <span className="text-[10px]">🔥</span>
          <span className="text-[10px] font-bold text-[#F59E0B] font-mono">{currentUser.streak}</span>
          {!collapsed && <span className="text-[10px] text-[#6B7E78]">day streak</span>}
        </div>
        <div className="w-7 h-7 rounded-full bg-[#34E0A1]/15 border border-[#34E0A1]/30 flex items-center justify-center text-[10px] font-bold text-[#34E0A1]">
          {currentUser.avatar}
        </div>
      </div>
    </aside>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function GlassesLogoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {collapsed
        ? <><path d="M4 3l4 3-4 3"/></>
        : <><path d="M8 3L4 6l4 3"/></>}
    </svg>
  );
}

function SunIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function ZapIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>; }
function MessageIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function FlagIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function TrendingIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>; }
function UsersIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function SettingsIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
